import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// The recommendation funnel — ported from the best open-source feed systems:
//
//   * xai-org/x-algorithm  (X/Twitter "For You", open sourced 2023):
//     multi-source candidate sourcing → visibility filtering → ranking →
//     heuristic re-rank. We mirror the SHAPES: several independent retrieval
//     streams merged into one candidate pool, then a rules layer.
//
//   * Covington et al. 2016, "Deep Neural Networks for YouTube
//     Recommendations" (the production YouTube algorithm): the watch-next
//     core is CO-VISITATION — "users who watched X also watched Y" — used as
//     a candidate generator ahead of the ranker. Item-item CF is by far the
//     strongest signal at small scale, so we port exactly that, in SQL.
//
//   * bytedance/monolith (the TikTok company's open-source recommender
//     framework): the whole point of TikTok-class ranking is the REAL-TIME
//     loop — signals learn within the same session. We port: session-interest
//     boost (last 2 h) and the negative skip signal (fast swipe-away).
//
//   * Exploration: instead of uniform jitter we use UCB1-flavoured optimism —
//     the less a test has been tried by the feed, the wider its exploration
//     window. New tests get a fair trial; mature tests stop being shuffled.
//
//   * Diversity re-rank (MMR-style greedy pass, standard in every production
//     feed incl. x-algorithm's heuristics layer): sliding-window caps per
//     topic and per author so no streak of near-identical cards.
//
// Everything here is bounded + index-backed and safe for serverless
// (Neon Postgres): no background jobs, no feature store, no model server.
// ---------------------------------------------------------------------------

const CAND_LIMIT_COVIS = 150;
const SEED_LIMIT = 12;
const SESSION_WINDOW_H = 2;
const COVIS_WINDOW_DAYS = 14;
const QUALITY_WINDOW_DAYS = 30;
const IMPRESSION_WINDOW_DAYS = 7;

export type RankRow = {
  id: string;
  tags: string[];
  topic: string;
  creatorId: string;
  createdAt: Date;
};

// --------------------------------------------------------------- 1. seeds ---
// The user's recently engaged tests: raw feed events (view/skip) + attempts.
// Attempts are the STRONG signal (minutes of real engagement), events are the
// high-volume signal. Both feed the co-visitation and session-interest.
export async function engagementSeeds(userId: string): Promise<string[]> {
  try {
    const [ev, at] = await Promise.all([
      db.$queryRawUnsafe<{ testId: string }[]>(
        `SELECT DISTINCT "testId" FROM "FeedEvent"
         WHERE "userId" = $1 AND "createdAt" > now() - interval '7 days'
         ORDER BY "testId" LIMIT ${SEED_LIMIT * 3}`,
        userId
      ),
      db.$queryRawUnsafe<{ testId: string }[]>(
        `SELECT DISTINCT "testId" FROM "TestAttempt"
         WHERE "userId" = $1 AND "startedAt" > now() - interval '7 days'
         ORDER BY "testId" LIMIT ${SEED_LIMIT * 2}`,
        userId
      ),
    ]);
    // Attempts first (stronger), then events, dedup, cap.
    const out: string[] = [];
    const seen = new Set<string>();
    for (const id of [...at.map(r => r.testId), ...ev.map(r => r.testId)]) {
      if (!seen.has(id)) { seen.add(id); out.push(id); }
      if (out.length >= SEED_LIMIT) break;
    }
    return out;
  } catch {
    return [];
  }
}

// --------------------------------------------------- 2. co-visitation (CF) ---
// YouTube watch-next, SQL edition: for every candidate, how many DISTINCT
// users engaged with BOTH a seed test and the candidate within 14 days.
// Returns map testId → weight (log-scaled at the scoring site).
export async function coVisitation(seeds: string[]): Promise<Map<string, number>> {
  if (!seeds.length) return new Map();
  try {
    const rows = await db.$queryRawUnsafe<{ testId: string; w: number }[]>(
      `SELECT b."testId" AS "testId", COUNT(DISTINCT a."userId")::int AS w
       FROM "FeedEvent" a
       JOIN "FeedEvent" b
         ON a."userId" = b."userId" AND b."testId" <> a."testId"
       WHERE a."testId" = ANY($1::text[])
         AND a."createdAt" > now() - interval '${COVIS_WINDOW_DAYS} days'
         AND b."createdAt" > now() - interval '${COVIS_WINDOW_DAYS} days'
       GROUP BY b."testId"
       ORDER BY w DESC
       LIMIT ${CAND_LIMIT_COVIS}`,
      seeds
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.testId, Math.max(1, r.w));
    return map;
  } catch {
    return new Map();
  }
}

// --------------------------------------------------- 3. session interest ---
// Monolith's real-time loop, minimal form: tags of what the user engaged with
// in the last 2 hours get a scoring multiplier. This is what makes the feed
// pivot MID-SESSION when the user discovers a new subject they like.
export async function sessionTags(userId: string): Promise<Map<string, number>> {
  if (!userId) return new Map();
  try {
    const rows = await db.$queryRawUnsafe<{ tags: string[] }[]>(
      `SELECT t.tags
       FROM "FeedEvent" e
       JOIN "Test" t ON t.id = e."testId"
       WHERE e."userId" = $1
         AND e."createdAt" > now() - interval '${SESSION_WINDOW_H} hours'
       ORDER BY e."createdAt" DESC
       LIMIT 8`,
      userId
    );
    const map = new Map<string, number>();
    rows.forEach((r, i) => {
      // Newest event weighs most; decay over the last few interactions.
      const w = 2.5 * Math.pow(0.8, i);
      for (const tag of r.tags || []) map.set(tag, (map.get(tag) || 0) + w);
    });
    return map;
  } catch {
    return new Map();
  }
}

// --------------------------------------------------- 4. quality prior -------
// Per-test engagement quality with Laplace smoothing (avoids the classic
// popularity trap where one viral-but-bad test eats the feed):
//   quality = smoothed completion rate × (0.5 + avg score ratio)
// Bounded aggregate over the last 30 days of attempts, candidate ids only.
export async function qualityPrior(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  try {
    const rows = await db.$queryRawUnsafe<{ id: string; starts: number; completes: number; ratio: number | null }[]>(
      `SELECT a."testId" AS id,
              COUNT(*)::int AS starts,
              COUNT(*) FILTER (WHERE a."completedAt" IS NOT NULL)::int AS completes,
              AVG(CASE WHEN a."totalQuestions" > 0
                       THEN a.score::float / a."totalQuestions" END) AS ratio
       FROM "TestAttempt" a
       WHERE a."testId" = ANY($1::text[])
         AND a."startedAt" > now() - interval '${QUALITY_WINDOW_DAYS} days'
       GROUP BY a."testId"`,
      ids
    );
    const map = new Map<string, number>();
    for (const r of rows) {
      const completionRate = (r.completes + 1) / (r.starts + 2); // Laplace α=1
      const scoreRatio = r.ratio == null ? 0.5 : Math.max(0, Math.min(1, r.ratio));
      map.set(r.id, Math.min(1.5, completionRate * (0.5 + scoreRatio)));
    }
    return map;
  } catch {
    return new Map();
  }
}

// --------------------------------------------------- 5. exploration (UCB) ---
// How many times the feed has TRIED this test recently. Few tries → wide
// exploration window (optimism under uncertainty); many tries → narrow.
export async function impressionCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  try {
    const rows = await db.$queryRawUnsafe<{ testId: string; c: number }[]>(
      `SELECT "testId", COUNT(*)::int AS c
       FROM "FeedEvent"
       WHERE "testId" = ANY($1::text[])
         AND "createdAt" > now() - interval '${IMPRESSION_WINDOW_DAYS} days'
       GROUP BY "testId"`,
      ids
    );
    return new Map(rows.map(r => [r.testId, r.c]));
  } catch {
    return new Map();
  }
}

// --------------------------------------------------- 6. seen bookkeeping ----
// TikTok principle: a completed test never occupies the prime slots again;
// a test viewed in the last 24 h is demoted (not hidden — the user may have
// swiped past too fast).
export async function seenTests(userId: string): Promise<{ completed: Set<string>; viewed24h: Set<string> }> {
  const completed = new Set<string>();
  const viewed24h = new Set<string>();
  if (!userId) return { completed, viewed24h };
  try {
    const [done, seen] = await Promise.all([
      db.$queryRawUnsafe<{ testId: string }[]>(
        `SELECT DISTINCT "testId" FROM "TestAttempt"
         WHERE "userId" = $1 AND "completedAt" IS NOT NULL LIMIT 500`,
        userId
      ),
      db.$queryRawUnsafe<{ testId: string }[]>(
        `SELECT DISTINCT "testId" FROM "FeedEvent"
         WHERE "userId" = $1 AND "createdAt" > now() - interval '24 hours' LIMIT 200`,
        userId
      ),
    ]);
    done.forEach(r => completed.add(r.testId));
    seen.forEach(r => viewed24h.add(r.testId));
  } catch { /* best-effort personalization */ }
  return { completed, viewed24h };
}

// --------------------------------------------------- 7. scoring -------------
// Same backbone as the original formula (continuity of the feed feel), the
// new terms slot in beside it. Weights calibrated so affinity still dominates
// and no single term can flatten the others.
export function scoreCandidate(
  r: RankRow,
  ctx: {
    affinity: Map<string, number>;      // long-term profile (decayed)
    session: Map<string, number>;       // last-2h tags
    covis: Map<string, number>;         // item-item CF weight
    quality: Map<string, number>;       // 0..1.5
    impressions: Map<string, number>;   // tries in 7d
    hotRank: Map<string, number>;       // 7d attempt popularity rank
    seedTags: Map<string, number>;      // picked interests (floor)
    completed: Set<string>;
    viewed24h: Set<string>;
    skippedThisWeek: Set<string>;
    now: number;
  }
): number {
  let interest = 0;
  for (const t of r.tags || []) interest += ctx.affinity.get(t) || 0;
  for (const t of r.tags || []) {
    const s = ctx.seedTags.get(t);
    if (s != null) interest = Math.max(interest, s);
  }
  let sessionScore = 0;
  for (const t of r.tags || []) sessionScore += ctx.session.get(t) || 0;

  const covisRaw = ctx.covis.get(r.id) || 0;
  const covis = covisRaw > 0 ? Math.log2(covisRaw + 1) * 2.2 : 0; // 1 user→2.2, 3→4.4, 7→6.6 …

  const quality = ctx.quality.get(r.id) ?? 0.75; // unknown → neutral-good prior
  const hot = ctx.hotRank.get(r.id) || 0;
  const ageDays = Math.max(0, (ctx.now - r.createdAt.getTime()) / 86_400_000);
  const freshness = 1 / (1 + ageDays);

  // UCB-flavoured exploration: amplitude shrinks as the test is tried.
  const tries = ctx.impressions.get(r.id) || 0;
  const exploration = Math.random() * (0.25 + 1.2 / Math.sqrt(1 + tries));

  let penalty = 0;
  if (ctx.completed.has(r.id)) penalty += 12;      // sink, not delete
  if (ctx.viewed24h.has(r.id)) penalty += 6;       // just seen
  if (ctx.skippedThisWeek.has(r.id)) penalty += 4; // user said no with a fast swipe

  return (
    3.0 * Math.min(interest, 30) +
    2.5 * Math.min(sessionScore, 15) +
    covis +
    2.0 * quality +
    1.5 * Math.sqrt(hot) +
    1.2 * freshness +
    exploration -
    penalty
  );
}

// --------------------------------------------------- 8. diversity re-rank ---
// Greedy MMR-lite (the heuristics layer of every production feed): walk the
// ranked list, sliding window of 5 — at most 3 cards of the same topic and
// 2 of the same author inside the window. A violating card is swapped with
// the next acceptable one instead of being dropped (reachability preserved).
export function diversify(order: RankRow[], window = 5, maxTopic = 3, maxAuthor = 2): RankRow[] {
  const out: RankRow[] = [];
  const pending = [...order];
  while (pending.length) {
    let pickIdx = 0;
    if (out.length >= window - 1) {
      const win = out.slice(-(window - 1));
      let topicCount = 0;
      let authorCount = 0;
      for (const w of win) {
        if (w.topic && w.topic === pending[0].topic) topicCount++;
        if (w.creatorId === pending[0].creatorId) authorCount++;
      }
      if (topicCount >= maxTopic || authorCount >= maxAuthor) {
        pickIdx = pending.findIndex(c => {
          let tc = 0;
          let ac = 0;
          for (const w of win) {
            if (w.topic && w.topic === c.topic) tc++;
            if (w.creatorId === c.creatorId) ac++;
          }
          return tc < maxTopic && ac < maxAuthor;
        });
        if (pickIdx < 0) pickIdx = 0; // everything violates → keep ranking order
      }
    }
    out.push(pending.splice(pickIdx, 1)[0]);
  }
  return out;
}
