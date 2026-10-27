import { db } from '@/lib/db';

/**
 * Publishing rule (product): a test may be PUBLIC (isPublic = true) only
 * under a title that no OTHER public test in the community library uses.
 * The comparison is case-insensitive on the trimmed title.
 *
 * Returns the clashing test (id + title) or null when the title is free.
 */
export async function findPublicTitleClash(title: string, excludeTestId?: string) {
  const clean = (title || '').trim();
  if (!clean) return null;
  return db.test.findFirst({
    where: {
      isPublic: true,
      ...(excludeTestId ? { id: { not: excludeTestId } } : {}),
      title: { equals: clean, mode: 'insensitive' },
    },
    select: { id: true, title: true },
  });
}
