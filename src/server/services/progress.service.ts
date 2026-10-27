// ---------------------------------------------------------------------------
// Progress service — saved in-test state ("Continue Test"), stored in the
// DATABASE per (user, test). Previously `chemtest_progress_v1:<uid>:<testId>`
// in localStorage — the largest blob on the phone (up to 2.5 MB per test).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";

// Same headroom the client enforced against the ~5MB localStorage quota.
const MAX_PROGRESS_CHARS = 2_500_000;

export async function getProgress(userId: string, testId: string) {
  const row = await db.savedProgress.findUnique({
    where: { userId_testId: { userId, testId } },
    select: { data: true, savedAt: true },
  });
  return { progress: row?.data ?? null, savedAt: row?.savedAt?.getTime?.() ?? null };
}

export async function saveProgress(userId: string, testId: string, data: unknown) {
  if (!testId || typeof testId !== "string" || testId.length > 64) {
    throw ApiError.badRequest("Invalid testId");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw ApiError.badRequest("Invalid progress payload");
  }
  const raw = JSON.stringify(data);
  if (raw.length > MAX_PROGRESS_CHARS) {
    // Huge test — refuse silently-ish; the client keeps its in-memory copy
    // for the running session (same contract as the old localStorage skip).
    throw ApiError.badRequest("Progress snapshot too large");
  }
  await db.savedProgress.upsert({
    where: { userId_testId: { userId, testId } },
    create: { userId, testId, data: data as object },
    update: { data: data as object },
  });
  return { ok: true };
}

export async function clearProgress(userId: string, testId: string) {
  await db.savedProgress.deleteMany({
    where: { userId, testId },
  });
  return { ok: true };
}
