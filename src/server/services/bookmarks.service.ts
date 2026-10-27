// ---------------------------------------------------------------------------
// Bookmarks service — the personal library.
//   GET    → { ids: string[] } — every test the user bookmarked
//   POST   → save a test to the user's library (idempotent upsert)
//   DELETE → remove the test from the user's library
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";

export async function listBookmarks(userId: string) {
  const rows = await db.bookmark.findMany({
    where: { userId },
    select: { testId: true },
    orderBy: { createdAt: "desc" },
  });
  return { ids: rows.map((r) => r.testId) };
}

export async function addBookmark(userId: string, testId: string) {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!test) throw ApiError.notFound("Test not found");

  await db.bookmark.upsert({
    where: { userId_testId: { userId, testId } },
    update: {},
    create: { userId, testId },
  });
  return { ok: true, bookmarked: true };
}

export async function removeBookmark(userId: string, testId: string) {
  await db.bookmark.deleteMany({ where: { userId, testId } });
  return { ok: true, bookmarked: false };
}
