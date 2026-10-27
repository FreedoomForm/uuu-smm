// ---------------------------------------------------------------------------
// Tags service — the global tag dictionary (editor autocomplete) and the
// popular-tags aggregation for the feed filter chips (5-minute module cache).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { popularTags } from "@/lib/popular";

export async function listTags(): Promise<{ tags: string[] }> {
  const tags = await db.tag.findMany({
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return { tags: tags.map((t) => t.name) };
}

export async function getPopularTags(): Promise<{ tags: { tag: string; count: number }[] }> {
  const rows = await popularTags(40);
  return { tags: rows };
}
