import { db } from '@/lib/db';

// Clean an incoming tags array: trim, collapse inner spaces, max 30 chars each,
// case-insensitive dedupe, at most 10 tags per test
export function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== 'string' && typeof r !== 'number') continue;
    const t = String(r).trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

// Make sure every tag used on a test is stored in the global Tag dictionary
// so it shows up in autocomplete suggestions next time someone types it.
// Never throws — tag bookkeeping must not block saving a test.
export async function ensureTagsExist(names: string[]) {
  for (const name of names) {
    try {
      const existing = await db.tag.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      });
      if (!existing) {
        await db.tag.create({ data: { name } });
      }
    } catch {
      // Unique-race or transient DB error — ignore
    }
  }
}
