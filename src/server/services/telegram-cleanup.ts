// ---------------------------------------------------------------------------
// Telegram channel cleanup helpers.
//
// Extracted from three routes that previously duplicated the same logic
// (tests/[id] PUT/DELETE and me DELETE): figuring out WHICH files hosted in
// the owner's Telegram channel must disappear when a test is edited, deleted
// or an account is removed. All deletions are best-effort — a Telegram hiccup
// must never fail the main operation.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";

export type ChannelFile = { fileId: string; msgId: number | null };

type QuestionPhotoRow = {
  imageUrl: string | null;
  imageMsgId: number | null;
  optionImages: unknown;
};

type NewQuestionLike = {
  imageUrl?: unknown;
  optionImages?: unknown;
};

/** Channel-post references that SURVIVE a save (still referenced after it). */
function keptRefsFromNewQuestions(questions: NewQuestionLike[]): Set<string> {
  const kept = new Set<string>();
  for (const q of questions) {
    if (typeof q.imageUrl === "string" && q.imageUrl.startsWith("tg:"))
      kept.add(q.imageUrl.slice(3));
    const oi = q.optionImages;
    if (oi && typeof oi === "object") {
      for (const v of Object.values(oi as Record<string, any>)) {
        const u = typeof v === "string" ? v : v?.u;
        if (typeof u === "string" && u.startsWith("tg:")) kept.add(u.slice(3));
      }
    }
  }
  return kept;
}

/** Extract (fileId, msgId) from one stored question's photo references. */
function photosOfRow(q: QuestionPhotoRow): ChannelFile[] {
  const out: ChannelFile[] = [];
  if (q.imageUrl?.startsWith("tg:"))
    out.push({ fileId: q.imageUrl.slice(3), msgId: q.imageMsgId });
  const oi = q.optionImages as Record<string, any> | null;
  if (oi && typeof oi === "object") {
    for (const v of Object.values(oi)) {
      const u = typeof v === "string" ? v : v?.u;
      if (typeof u === "string" && u.startsWith("tg:")) {
        out.push({
          fileId: u.slice(3),
          msgId: typeof v === "object" ? (v?.m ?? null) : null,
        });
      }
    }
  }
  return out;
}

/**
 * Question photos removed/replaced by an edit: they must ALSO disappear from
 * the Telegram channel, not just from the DB. Photos whose reference survives
 * the save keep their channel post.
 */
export function removedQuestionPhotos(
  oldQuestions: QuestionPhotoRow[],
  newQuestions: NewQuestionLike[]
): ChannelFile[] {
  const kept = keptRefsFromNewQuestions(newQuestions);
  const removed: ChannelFile[] = [];
  for (const q of oldQuestions) {
    for (const p of photosOfRow(q)) {
      if (!kept.has(p.fileId)) removed.push(p);
    }
  }
  return removed;
}

/** Every channel-hosted file of one test (attachments + photos + archive). */
export async function collectTestChannelFiles(
  testId: string,
  archive?: { archiveId?: string | null; archiveMsgId?: number | null } | null
): Promise<ChannelFile[]> {
  const files: ChannelFile[] = [];

  const attachments = await db.attachment.findMany({
    where: { testId, url: { startsWith: "tg:" } },
    select: { url: true, tgMessageId: true },
  });
  for (const a of attachments)
    files.push({ fileId: a.url.slice(3), msgId: a.tgMessageId });

  const questions = await db.question.findMany({
    where: { testId },
    select: { imageUrl: true, imageMsgId: true, optionImages: true },
  });
  for (const q of questions) files.push(...photosOfRow(q));

  if (archive?.archiveId) {
    files.push({ fileId: archive.archiveId, msgId: archive.archiveMsgId ?? null });
  }
  return files;
}

/** Every channel-hosted file owned by a user (before the account cascade). */
export async function collectUserChannelFiles(
  userId: string
): Promise<ChannelFile[]> {
  const files: ChannelFile[] = [];

  const attachments = await db.attachment.findMany({
    where: { test: { creatorId: userId }, url: { startsWith: "tg:" } },
    select: { url: true, tgMessageId: true },
  });
  for (const a of attachments)
    files.push({ fileId: a.url.slice(3), msgId: a.tgMessageId });

  const questions = await db.question.findMany({
    where: { test: { creatorId: userId } },
    select: { imageUrl: true, imageMsgId: true, optionImages: true },
  });
  for (const q of questions) files.push(...photosOfRow(q));

  const profile = await db.user.findUnique({
    where: { id: userId },
    select: { image: true },
  });
  if (profile?.image?.startsWith("tg:")) {
    files.push({ fileId: profile.image.slice(3), msgId: null });
  }

  const archives = await db.test.findMany({
    where: { creatorId: userId, archiveId: { not: null } },
    select: { archiveId: true, archiveMsgId: true },
  });
  for (const a of archives) {
    files.push({ fileId: a.archiveId as string, msgId: a.archiveMsgId ?? null });
  }

  return files;
}
