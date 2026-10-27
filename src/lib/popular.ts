import { db } from '@/lib/db';

// Popular tags across all public tests — bounded aggregation, cached in module
// memory for 5 minutes (serverless-safe: each warm lambda keeps its own copy).
let popCache: { tags: { tag: string; count: number }[]; at: number } | null = null;
const POP_TTL_MS = 5 * 60_000;

export async function popularTags(limit = 60): Promise<{ tag: string; count: number }[]> {
  if (popCache && Date.now() - popCache.at < POP_TTL_MS) {
    return popCache.tags.slice(0, limit);
  }
  const rows = await db.$queryRawUnsafe<{ tag: string; count: number }[]>(`
    SELECT tag, COUNT(*)::int AS count
    FROM "Test", UNNEST(tags) AS tag
    WHERE "isPublic" = TRUE
    GROUP BY tag
    ORDER BY count DESC, tag ASC
    LIMIT ${Math.min(100, Math.max(1, limit))}`);
  popCache = { tags: rows, at: Date.now() };
  return rows;
}
