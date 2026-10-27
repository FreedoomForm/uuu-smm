// ---------------------------------------------------------------------------
// Feed service — the personalized, paginated test feed + engagement signals.
//
// The ranking funnel itself is the Task 10 system (multi-source retrieval +
// co-visitation + session interest + UCB exploration + diversity re-rank,
// modeled on the open production feed systems: x-algorithm, YouTube DNN,
// ByteDance Monolith) and is preserved verbatim. What this service adds is
// the professional API wrapper around it: zod-validated input (feedQuerySchema),
// ApiError-based failures and a single well-documented unit.
//
// Response shapes are contractual (the TanStack Query layer on the frontend
// depends on them):
//   GET  → { items, nextCursor, tab, tagInfo?, personalized? }
//   POST → { ok: boolean }
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { affinityMap, bumpAffinity } from "@/lib/affinity";
import {
  engagementSeeds,
  coVisitation,
  sessionTags,
  qualityPrior,
  impressionCounts,
  seenTests,
  scoreCandidate,
  diversify,
  type RankRow,
} from "@/lib/recommender";
import { ApiError } from "@/server/http/errors";
import type { feedSignalSchema } from "@/server/schemas";
import type { z } from "zod";

export type FeedQuery = {
  tab: "foryou" | "trending" | "new";
  scope: "all" | "mine" | "discover";
  limit: number;
  tag: string | null;
  q: string | null;
  creatorId: string | null;
  cursor: string | null;
};

const PAGE_LIMIT = 10;
const MAX_LIMIT = 20;
// Candidate pools for the personalized ranking (bounded, index-backed scans)
const FORYOU_RECENT_POOL = 800;
const FORYOU_HOT_POOL = 200;
// In-memory cache of the ranked "For You" id list per user+filter combo
const foryouCache = new Map<
  string,
  { ids: string[]; rankedAt: number; base: { createdAt: Date; id: string } | null }
>();
const FORYOU_TTL_MS = 90_000;

type CursorInfo =
  | { mode: "offset"; offset: number }
  | { mode: "keyset"; createdAt: Date; id: string }
  | null;

function parseCursor(raw: string | null): CursorInfo {
  if (!raw) return null;
  if (raw.startsWith("o:")) {
    const n = parseInt(raw.slice(2), 10);
    return Number.isFinite(n) && n >= 0 ? { mode: "offset", offset: n } : null;
  }
  const sep = raw.indexOf("|");
  if (sep > 0) {
    const d = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!Number.isNaN(d.getTime()) && id)
      return { mode: "keyset", createdAt: d, id };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Personal-library NAME RULE — at most ONE test per name in the "mine" scope.
//
// When the user modifies a test (POST /tests/[id]/copy) the copy keeps the
// source's exact title and is auto-bookmarked (see tests.service.copyTest).
// The library must then show ONLY the modified card — not the modified copy
// next to the pinned original. The rule generalizes to every same-name pair:
//
//   * the user's OWN test beats a bookmarked foreign original with the same
//     name (the modification replaces the source — "only the second stays");
//   * a newer own version beats an older own version (the latest edit wins);
//   * among bookmarked originals the newest wins.
//
// The losers ("shadowed" tests) are hidden from the feed AND excluded from
// the keyset tail, so a hidden card can never resurface on page 5. Shadowing
// is intentionally NON-destructive: the bookmark rows stay in the database,
// and if the winning copy is deleted the original resurfaces on the next
// fetch — the library heals itself.
//
// Family key: exact title — plus a legacy bridge. Old copies were named
// "<title> · <owner name>" (+" (2)"…); stripping that known suffix lets a
// legacy copy collapse into the family of its pinned original. A title only
// folds when its tail equals the OWNER'S display name, so user-typed
// " · " separators (e.g. "Биология · Курс") never collide.
// ---------------------------------------------------------------------------

function nameFamily(title: string, ownerName: string | null | undefined): string {
  const raw = (title || "").trim();
  let t = raw;
  const name = (ownerName || "").trim();
  if (name) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s*·\\s*${esc}\\s*(\\(\\d+\\))?\\s*$`), "");
  }
  const key = t.trim().toLowerCase();
  return key || raw.toLowerCase();
}

function personalLibraryShadowed(
  rows: {
    id: string;
    title: string;
    creatorId: string;
    createdAt: Date;
    creator?: { name?: string | null } | null;
  }[],
  userId: string
): Set<string> {
  const winners = new Map<string, { id: string; own: boolean; at: number }>();
  const shadowed = new Set<string>();
  for (const r of rows) {
    const e = {
      id: r.id,
      fam: nameFamily(r.title, r.creator?.name),
      own: r.creatorId === userId,
      at: new Date(r.createdAt).getTime(),
    };
    const cur = winners.get(e.fam);
    if (!cur) {
      winners.set(e.fam, e);
      continue;
    }
    const eWins =
      (e.own && !cur.own) || (e.own === cur.own && e.at > cur.at);
    if (eWins) {
      shadowed.add(cur.id);
      winners.set(e.fam, e);
    } else {
      shadowed.add(e.id);
    }
  }
  return shadowed;
}

export async function getFeed(
  query: FeedQuery,
  userId: string | null
): Promise<Response> {
  const tab = query.tab;
  const scope = query.scope;
  const limit = Math.min(MAX_LIMIT, Math.max(2, query.limit || PAGE_LIMIT));
  const { tag, q, creatorId } = query;
  const cursor = parseCursor(query.cursor);

  // Bookmarks for the "mine" scope (empty list → only the user's own tests)
  const bookmarkIds =
    scope === "mine" && userId
      ? (
          await db.bookmark.findMany({
            where: { userId },
            select: { testId: true },
          })
        ).map((r) => r.testId)
      : [];

  // ---- visibility: public tests + the user's own (legacy "all" scope) ----
  // Version rule: a VERSION (Test.parentId != null — a copy of somebody's
  // test) is NEVER part of the community library. The public feed shows only
  // trunks (tests created from scratch); versions are reachable by direct
  // link and inside their owner's personal library ("mine" scope keeps them).
  let visibility: any;
  if (scope === "mine") {
    visibility = userId
      ? {
          OR: [
            { creatorId: userId },
            ...(bookmarkIds.length ? [{ id: { in: bookmarkIds } }] : []),
          ],
        }
      : { id: { in: [] } };
  } else if (scope === "discover") {
    visibility = userId
      ? { AND: [{ isPublic: true }, { parentId: null }, { creatorId: { not: userId } }] }
      : { AND: [{ isPublic: true }, { parentId: null }] };
  } else {
    visibility = userId
      ? { OR: [{ isPublic: true, parentId: null }, { creatorId: userId }] }
      : { AND: [{ isPublic: true }, { parentId: null }] };
  }

  // ---- personal-library name rule (scope = mine) ---------------------------
  // ONE test per name: compute the shadowed ids over the user's WHOLE scope
  // (own tests + bookmarks) before any pagination happens. Applied to the
  // candidate pool below and to the keyset tail — a hidden card must never
  // resurface on a later page.
  let shadowedIds: Set<string> = new Set();
  if (scope === "mine" && userId) {
    const scopeRows = await db.test.findMany({
      where: visibility,
      select: {
        id: true,
        title: true,
        creatorId: true,
        createdAt: true,
        creator: { select: { name: true } },
      },
    });
    shadowedIds = personalLibraryShadowed(scopeRows, userId);
  }

  // ---- shared filters (tag / search / author) ----
  const filters: any[] = [visibility];
  if (tag) filters.push({ tags: { has: tag } });

  // Search is TAG-based (product decision): resolve the query to matching tag
  // names first, then keep tests carrying any of those tags. When the exact
  // tag does not exist yet it is CREATED in the dictionary and the caller is
  // told via tagInfo.
  let tagInfo: {
    query: string;
    exists: boolean;
    created: boolean;
    similar: string[];
  } | null = null;
  if (q) {
    // Close tags = substring (ILIKE) PLUS trigram-similar (typo tolerance,
    // pg_trgm) matches, closest first.
    let matchedTags: string[] = [];
    try {
      const rows = await db.$queryRawUnsafe<{ tag: string }[]>(
        `SELECT tg.tag FROM "Test" t CROSS JOIN LATERAL unnest(t.tags) AS tg(tag)
         WHERE tg.tag ILIKE $1 OR similarity(tg.tag, $2) > 0.3
         GROUP BY tg.tag ORDER BY similarity(tg.tag, $2) DESC LIMIT 25`,
        `%${q}%`,
        q
      );
      matchedTags = rows.map((r) => r.tag);
    } catch {
      const rows = await db.$queryRawUnsafe<{ tag: string }[]>(
        `SELECT DISTINCT tg.tag FROM "Test" t CROSS JOIN LATERAL unnest(t.tags) AS tg(tag) WHERE tg.tag ILIKE $1 LIMIT 25`,
        `%${q}%`
      );
      matchedTags = rows.map((r) => r.tag);
    }
    // Exact (case-insensitive) existence: Tag dictionary OR any test's tags
    const exactRows = await db.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT (EXISTS (SELECT 1 FROM "Tag" WHERE name ILIKE $1) OR EXISTS (
         SELECT 1 FROM "Test" t CROSS JOIN LATERAL unnest(t.tags) tg WHERE tg ILIKE $1)) AS ok`,
      q
    );
    const exists = !!exactRows[0]?.ok;
    let created = false;
    if (!exists && q.length >= 2) {
      try {
        await db.tag.upsert({ where: { name: q }, update: {}, create: { name: q } });
        created = true;
      } catch {
        /* dictionary write is best-effort — search still works */
      }
    }
    tagInfo = {
      query: q,
      exists, // existed BEFORE this search
      created, // we just created it in the dictionary
      similar: matchedTags
        .filter((t) => t.toLowerCase() !== q.toLowerCase())
        .slice(0, 8),
    };
    filters.push(
      matchedTags.length
        ? { tags: { hasSome: matchedTags } }
        : { id: { in: [] } }
    );
  }
  if (creatorId) filters.push({ creatorId });

  const slimSelect = {
    id: true,
    title: true,
    description: true,
    topic: true,
    creatorId: true,
    parentId: true,
    changedCount: true,
    versionName: true,
    creator: { select: { id: true, name: true, image: true } },
    isPublic: true,
    tags: true,
    coverIcon: true,
    coverColor: true,
    createdAt: true,
    randomizeQuestions: true,
    randomizeOptions: true,
    _count: { select: { questions: true, attempts: true, attachments: true } },
  } as const;

  const toCard = (r: any) => ({
    ...r,
    description: (r.description || "").slice(0, 280),
    hasCoverImage: false,
    createdAt:
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
  });

  // Slim rows by ids, preserving the requested order
  const slimByIds = async (ids: string[]) => {
    if (!ids.length) return [];
    const rows = await db.test.findMany({
      where: { id: { in: ids } },
      select: slimSelect,
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(toCard);
  };

  // ------------------------------ NEW (keyset) ------------------------------
  if (tab === "new") {
    const where: any = { AND: [...filters] };
    // Name rule: same-name losers stay hidden on every page of the "new" tab
    if (shadowedIds.size) where.AND.push({ id: { notIn: [...shadowedIds] } });
    if (cursor?.mode === "keyset") {
      where.AND.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }
    const rows = await db.test.findMany({
      where,
      select: slimSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return NextResponse.json({
      items: page.map(toCard),
      nextCursor:
        hasMore && last
          ? `${new Date(last.createdAt).toISOString()}|${last.id}`
          : null,
      tab,
      tagInfo,
    });
  }

  // ------------------------------ TRENDING ----------------------------------
  // Hot = attempts in the last 7 days (indexed subquery), tie-break by recency.
  if (tab === "trending") {
    const offset = cursor?.mode === "offset" ? cursor.offset : 0;
    if (offset > 2000)
      return NextResponse.json({ items: [], nextCursor: null, tab });

    const conds: string[] = [];
    const params: any[] = [];
    if (scope === "mine") {
      // Own tests + bookmarked ones (regardless of isPublic — a bookmark
      // stays readable in the library even if the author later privatizes it)
      const bmIdx = params.push(bookmarkIds);
      const meIdx = params.push(userId || "");
      conds.push(
        `(t."creatorId" = $${meIdx} OR t."id" = ANY($${bmIdx}::text[]))`
      );
    } else {
      conds.push('t."isPublic" = TRUE');
      if (scope === "discover" && userId) {
        const meIdx = params.push(userId);
        conds.push(`t."creatorId" <> $${meIdx}`);
      }
    }
    if (tag) {
      params.push(tag);
      conds.push(`$${params.length} = ANY(t.tags)`);
    }
    if (q) {
      params.push(`%${q}%`);
      conds.push(
        `EXISTS (SELECT 1 FROM unnest(t.tags) tg WHERE tg ILIKE $${params.length})`
      );
    }
    if (creatorId) {
      params.push(creatorId);
      conds.push(`t."creatorId" = $${params.length}`);
    }
    params.push(limit + 1, offset);
    const lim = `$${params.length - 1}`;
    const off = `$${params.length}`;
    const sql = `
      SELECT t.id
      FROM "Test" t
      LEFT JOIN (
        SELECT "testId", COUNT(*)::int AS c
        FROM "TestAttempt"
        WHERE "startedAt" > now() - interval '7 days'
        GROUP BY "testId"
      ) a ON a."testId" = t.id
      WHERE ${conds.join(" AND ")}
      ORDER BY COALESCE(a.c, 0) DESC, t."createdAt" DESC, t.id DESC
      LIMIT ${lim} OFFSET ${off}`;
    const ids = (await db.$queryRawUnsafe<{ id: string }[]>(sql, ...params)).map(
      (r) => r.id
    );
    const hasMore = ids.length > limit;
    const items = await slimByIds(ids.slice(0, limit));
    return NextResponse.json({
      items,
      nextCursor: hasMore ? `o:${offset + limit}` : null,
      tab,
      tagInfo,
    });
  }

  // ------------------------------ FOR YOU -----------------------------------
  // 1) Decaying tag-affinity profile (+ picked interests as a floor).
  // 2) Rank a BOUNDED candidate pool: newest FORYOU_RECENT_POOL tests plus
  //    the FORYOU_HOT_POOL hottest ones.
  // 3) Cache the ranked id list for 90 s; cursor = offset into the pool.
  //    NOT cached for scope='mine': bookmarks change the personal library
  //    instantly, a 90 s stale "empty" list right after bookmarking would
  //    look like the bookmark didn't work.
  // 4) Past the pool → keyset continuation on (createdAt, id), still infinite.
  let poolIds: string[] = [];
  let baseCursor: { createdAt: Date; id: string } | null = null;

  const cacheKey = `${userId || "anon"}:${scope}:${tag || ""}:${q || ""}:${
    creatorId || ""
  }`;
  const cached = scope === "mine" ? null : foryouCache.get(cacheKey);
  if (cached && Date.now() - cached.rankedAt < FORYOU_TTL_MS) {
    poolIds = cached.ids;
    baseCursor = cached.base;
  } else {
    // ── Multi-source retrieval: every stream contributes candidates, the
    // ranker decides. Sources: the long-term affinity profile, hot tests,
    // CO-VISITATION (item-item CF) and the session-interest window.
    const [aff, hotIdsRows, u, seeds, session] = await Promise.all([
      userId
        ? affinityMap(userId)
        : Promise.resolve(new Map<string, number>()),
      db.$queryRawUnsafe<{ id: string }[]>(`
        SELECT t.id
        FROM "Test" t
        LEFT JOIN (
          SELECT "testId", COUNT(*)::int AS c
          FROM "TestAttempt"
          WHERE "startedAt" > now() - interval '7 days'
          GROUP BY "testId"
        ) a ON a."testId" = t.id
        WHERE t."isPublic" = TRUE
        ORDER BY COALESCE(a.c, 0) DESC, t."createdAt" DESC
        LIMIT ${FORYOU_HOT_POOL}`),
      userId
        ? db.user
            .findUnique({
              where: { id: userId },
              select: { interests: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      userId ? engagementSeeds(userId) : Promise.resolve([] as string[]),
      userId
        ? sessionTags(userId)
        : Promise.resolve(new Map<string, number>()),
    ]);

    const [covis, seen] = await Promise.all([
      seeds.length
        ? coVisitation(seeds)
        : Promise.resolve(new Map<string, number>()),
      seenTests(userId || ""),
    ]);
    // Explicit negative feedback: fast swipe-aways this week.
    const skippedRows = userId
      ? await db.feedEvent
          .findMany({
            where: {
              userId,
              kind: "skip",
              createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
            },
            select: { testId: true },
            distinct: ["testId"],
          })
          .catch(() => [] as { testId: string }[])
      : [];
    const skippedThisWeek = new Set(skippedRows.map((r) => r.testId));

    const seedScore = new Map<string, number>(aff);
    for (const it of u?.interests || []) {
      const cur = seedScore.get(it) || 0;
      seedScore.set(it, Math.max(cur, 6));
    }

    // Candidate pool = newest N (index scan on (isPublic, createdAt, id))
    const recentRows = await db.test.findMany({
      where: { AND: filters },
      select: { id: true, tags: true, topic: true, creatorId: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FORYOU_RECENT_POOL,
    });

    const now = Date.now();
    const hotRank = new Map<string, number>();
    hotIdsRows.forEach((r, i) => hotRank.set(r.id, hotIdsRows.length - i));
    const recentMap = new Map(recentRows.map((r) => [r.id, r]));
    // Hot candidates outside the recent pool still need tags/age → slim fetch
    const missingHot = [...hotRank.keys()].filter((id) => !recentMap.has(id));
    const extraRows = missingHot.length
      ? await db.test.findMany({
          where: { AND: [...filters, { id: { in: missingHot } }] },
          select: { id: true, tags: true, topic: true, creatorId: true, createdAt: true },
        })
      : [];

    // CO-VISITATION stream: tests co-engaged by other users with this user's
    // recent activity, not already in the pool.
    const extraMap = new Map(extraRows.map((r) => [r.id, r]));
    const covisIds = [...covis.keys()]
      .filter((id) => !recentMap.has(id) && !extraMap.has(id))
      .slice(0, 100);
    const covisRows = covisIds.length
      ? await db.test.findMany({
          where: { AND: [...filters, { id: { in: covisIds } }] },
          select: { id: true, tags: true, topic: true, creatorId: true, createdAt: true },
        })
      : [];

    const candidates: RankRow[] = [...recentRows, ...extraRows, ...covisRows]
      // Name rule: same-name losers never enter the ranking pool at all
      .filter((r) => !shadowedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        tags: r.tags || [],
        topic: r.topic,
        creatorId: r.creatorId,
        createdAt: r.createdAt,
      })
    );
    const allIds = candidates.map((c) => c.id);
    const [quality, impressions] = await Promise.all([
      qualityPrior(allIds),
      impressionCounts(allIds),
    ]);

    const scored = candidates
      .map((r) => ({
        r,
        score: scoreCandidate(r, {
          affinity: seedScore,
          session,
          covis,
          quality,
          impressions,
          hotRank,
          seedTags: seedScore,
          completed: seen.completed,
          viewed24h: seen.viewed24h,
          skippedThisWeek,
          now,
        }),
      }))
      .sort(
        (a, b) =>
          b.score - a.score || (a.r.createdAt < b.r.createdAt ? 1 : -1)
      );
    // Diversity re-rank (MMR-lite): no streaks of same topic/author.
    const ordered = diversify(scored.map((s) => s.r));
    poolIds = ordered.map((r) => r.id);
    // Keyset FLOOR = the OLDEST candidate by (createdAt, id) — NOT the last
    // element of the score-ordered pool (see Task 11-2 duplicate fix).
    baseCursor = ordered.reduce<{ createdAt: Date; id: string } | null>(
      (min, r) =>
        !min ||
        r.createdAt < min.createdAt ||
        (r.createdAt === min.createdAt && r.id < min.id)
          ? { createdAt: r.createdAt, id: r.id }
          : min,
      null
    );
    if (foryouCache.size > 500) foryouCache.clear();
    if (scope !== "mine")
      foryouCache.set(cacheKey, {
        ids: poolIds,
        rankedAt: Date.now(),
        base: baseCursor,
      });
  }

  const offset = cursor?.mode === "offset" ? cursor.offset : 0;
  let pageIds = poolIds.slice(offset, offset + limit);
  let nextCursor: string | null = null;

  if (pageIds.length < limit && baseCursor) {
    // Pool exhausted → keyset continuation strictly BELOW the pool floor.
    // notIn(poolIds): belt-and-suspenders — an already-pooled test must
    // never appear twice in one response, whatever the cursor says.
    // notIn(shadowedIds): the name rule — a same-name loser hidden from the
    // pool must not sneak back in through the tail either.
    const where: any = {
      AND: [
        ...filters,
        { id: { notIn: [...poolIds, ...shadowedIds] } },
        {
          OR: [
            { createdAt: { lt: baseCursor.createdAt } },
            { createdAt: baseCursor.createdAt, id: { lt: baseCursor.id } },
          ],
        },
      ],
    };
    const rows = await db.test.findMany({
      where,
      select: { id: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit - pageIds.length,
    });
    pageIds = [...pageIds, ...rows.map((r) => r.id)];
    const lastRow = rows[rows.length - 1];
    nextCursor = lastRow
      ? `${lastRow.createdAt.toISOString()}|${lastRow.id}`
      : null;
  } else if (pageIds.length === limit && offset + limit < poolIds.length) {
    nextCursor = `o:${offset + limit}`;
  }

  const items = await slimByIds(pageIds);
  return NextResponse.json({ items, nextCursor, tab, tagInfo, personalized: !!userId });
}

// ---------------------------------------------------------------------------
// POST /api/feed — engagement signals for the recommendation funnel.
//   view  — the card stayed on screen (ms = dwell time)
//   skip  — swiped away in under ~1.8 s (the TikTok negative signal)
// Anonymous callers get the historical silent { ok: false } — no error.
// ---------------------------------------------------------------------------

const SKIP_AFFINITY_DELTA = -1.5;
const VIEW_AFFINITY_DELTA = 1;

export async function recordFeedSignal(
  body: z.infer<typeof feedSignalSchema>,
  userId: string | null
): Promise<Response> {
  if (!userId) return NextResponse.json({ ok: false });
  const { testId, kind, ms } = body;

  const test = await db.test.findUnique({
    where: { id: testId },
    select: { tags: true, isPublic: true, creatorId: true },
  });
  if (!test || (!test.isPublic && test.creatorId !== userId)) {
    return NextResponse.json({ ok: false });
  }

  // Raw event stream (co-visitation + quality prior + exploration control)
  await db.feedEvent
    .create({
      data: {
        userId,
        testId,
        kind,
        ms:
          kind === "view" && Number.isFinite(ms)
            ? Math.min(600000, Math.max(0, Math.round(ms as number)))
            : null,
      },
    })
    .catch(() => {});

  // Tag profile: positive on dwell, negative on fast swipe-away
  const delta = kind === "skip" ? SKIP_AFFINITY_DELTA : VIEW_AFFINITY_DELTA;
  await bumpAffinity(userId, test.tags || [], delta);

  // Opportunistic 30-day retention purge (~2% of signal writes — cheap,
  // index-backed, keeps the co-visitation join fast forever)
  if (Math.random() < 0.02) {
    db.$executeRawUnsafe(
      `DELETE FROM "FeedEvent" WHERE "createdAt" < now() - interval '30 days'`
    ).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
