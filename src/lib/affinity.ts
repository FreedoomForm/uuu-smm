import { db } from '@/lib/db';

// ---------------------------------------------------------------------------
// Tag-affinity engine — the interest profile that powers the "For You" feed.
//
// Every meaningful action on a test adds weight to that test's tags:
//   open (feed impression)  +1
//   start (attempt created) +4
//   complete                +6
//   interests picked once   +10 (base seed)
// Scores decay with a 14-day half-life at read time, so the profile always
// mirrors what the user is interested in NOW, not a year ago.
// ---------------------------------------------------------------------------

export const DECAY_HALF_LIFE_DAYS = 14;

export function decayedScore(score: number, updatedAt: Date, now = Date.now()): number {
  const ageDays = Math.max(0, (now - updatedAt.getTime()) / 86_400_000);
  return score * Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
}

/** Add `delta` to each tag for a user (upsert, never throws). */
export async function bumpAffinity(userId: string, tags: string[], delta: number) {
  if (!userId || !tags?.length || !delta) return;
  for (const rawTag of tags) {
    const tag = String(rawTag).trim().slice(0, 30);
    if (!tag) continue;
    try {
      await db.tagAffinity.upsert({
        where: { userId_tag: { userId, tag } },
        create: { userId, tag, score: delta },
        update: { score: { increment: delta } },
      });
    } catch {
      // Bookkeeping must never break the main action
    }
  }
}

/** Read + decay the user's affinity map (top `limit` tags). */
export async function affinityMap(userId: string, limit = 60): Promise<Map<string, number>> {
  const rows = await db.tagAffinity.findMany({
    where: { userId },
    orderBy: { score: 'desc' },
    take: limit,
  });
  const now = Date.now();
  const map = new Map<string, number>();
  for (const r of rows) {
    const s = decayedScore(r.score, r.updatedAt, now);
    if (s > 0.05) map.set(r.tag, s);
  }
  return map;
}

/** Add the user's picked interests into the affinity table as a strong seed. */
export async function seedInterests(userId: string, interests: string[]) {
  await bumpAffinity(userId, interests, 10);
}
