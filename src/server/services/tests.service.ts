// ---------------------------------------------------------------------------
// Tests service — the test domain: list / get / create / update / delete /
// copy / share / archive / per-question translations.
//
// Business rules preserved from the previous routes (they are product
// decisions, not bugs):
//   * editing is CREATOR-ONLY — other users edit their own copy;
//   * a test may go PUBLIC only under a title no other public test uses
//     (409 PUBLISH_NAME_TAKEN — the frontend matches that string verbatim);
//   * Telegram-hosted files removed during edits/deletes are purged from the
//     channel best-effort;
//   * the content archive (JSON in the Telegram channel) is written on every
//     save and never fails the save itself.
// What changed is the plumbing: zod-validated input, ApiError failures,
// creator-only authorization in one place, deduplicated Telegram cleanup.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { uploadTestArchive, deleteTestArchive } from "@/lib/test-archive";
import { sanitizeTags, ensureTagsExist } from "@/lib/tags";
import { findPublicTitleClash } from "@/lib/publish";
import { telegramDeleteFile, telegramFileUrl } from "@/lib/telegram";
import { NextResponse, after } from "next/server";
import { ApiError } from "@/server/http/errors";
import type {
  createTestSchema,
  updateTestSchema,
  shareTestSchema,
  saveTranslationsSchema,
} from "@/server/schemas";
import type { z } from "zod";
import { removedQuestionPhotos } from "./telegram-cleanup";
import { generateAiMetrics } from "./test-metrics.service";

type CreateTestInput = z.infer<typeof createTestSchema>;
type UpdateTestInput = z.infer<typeof updateTestSchema>;
type ShareInput = z.infer<typeof shareTestSchema>;
type SaveTranslationsInput = z.infer<typeof saveTranslationsSchema>;

// ------------------------------------------------------------------ helpers --

function cleanCoverIcon(v: unknown): string | null {
  return typeof v === "string" &&
    [...v.trim()].length >= 1 &&
    [...v.trim()].length <= 8
    ? v.trim()
    : null;
}

function cleanCoverColor(v: unknown): string | null {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
}

function questionCreateData(q: any, index: number) {
  return {
    text: q.text,
    optionA: q.optionA,
    optionB: q.optionB,
    optionC: q.optionC,
    optionD: q.optionD,
    optionE: q.optionE || null,
    correctAnswer: q.correctAnswer || "A",
    explanation: q.explanation ?? null,
    translations: q.translations ?? undefined,
    imageNumber: q.imageNumber || null,
    imageUrl: typeof q.imageUrl === "string" && q.imageUrl ? q.imageUrl : null,
    imageMsgId: typeof q.imageMsgId === "number" ? q.imageMsgId : null,
    optionImages:
      q.optionImages && typeof q.optionImages === "object"
        ? q.optionImages
        : undefined,
    orderNum: index,
  };
}

// ---------------------------------------------------------------------- list --

export async function listTests(
  userId: string | null,
  creatorId: string | null
) {
  let where: any = {};
  if (creatorId) {
    // Another user's library: only their PUBLIC tests are visible to the
    // requester (their private ones stay private). The creator themself
    // still sees everything they own.
    if (creatorId === userId) {
      where.creatorId = creatorId;
    } else {
      where = { creatorId, isPublic: true };
    }
  } else if (userId) {
    where = {
      OR: [{ creatorId: userId }, { isPublic: true }],
    };
  } else {
    where.isPublic = true;
  }

  const testsRaw = await db.test.findMany({
    where,
    include: {
      creator: { select: { id: true, name: true, image: true } },
      _count: { select: { questions: true, attempts: true, attachments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Strip coverImage from response to keep it small, add hasCoverImage flag
  return testsRaw.map(({ coverImage, ...rest }) => ({
    ...rest,
    hasCoverImage: !!coverImage,
  }));
}

// ------------------------------------------------------------------------ get --

export async function getTest(id: string) {
  const test = await db.test.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      questions: { orderBy: { orderNum: "asc" } },
      attachments: { orderBy: { orderNum: "asc" } },
      _count: { select: { attempts: true } },
    },
  });
  if (!test) throw ApiError.notFound("Test not found");
  return test;
}

// ------------------------------------------------------------------ versions --

// Version-tree product rules (see prisma/schema.prisma — Test.parentId/rootId):
//   * A test created FROM SCRATCH is a trunk (parentId = null) — the ONLY kind
//     of test that may be public.
//   * A copy of somebody's test ("Edit") is a VERSION. Versions are reachable
//     only by direct link (and their owner's personal library) — they never
//     appear in the community library and can never be made public.
//   * A version may only become a SHAREABLE test when it differs from its
//     direct parent in at least MIN_FORK_CHANGED_QUESTIONS questions/answers.
//     Smaller contributions are rejected with VERSION_TOO_SIMILAR — the client
//     shows the rule dialog ("change 2+ questions or answers first").
export const MIN_FORK_CHANGED_QUESTIONS = 2;

// Normalize a question to its content identity: text + answers + correct
// letter. Whitespace-only edits do not count as changes; explanation/translation
// tweaks deliberately do NOT count (they are annotations, not content).
function questionFingerprint(q: {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE?: string | null;
  correctAnswer: string;
}): string {
  const s = (v: string | null | undefined) => String(v ?? "").replace(/\s+/g, " ").trim();
  return [
    s(q.text), s(q.optionA), s(q.optionB), s(q.optionC), s(q.optionD), s(q.optionE), s(q.correctAnswer),
  ].join("\u0000");
}

/**
 * How many questions/answers differ between a fork and its parent. An IN-PLACE
 * edit of one question counts as ONE change (not two): the multiset of
 * identical fingerprints is matched first, and whatever cannot be matched on
 * the longer side is the change count — edits, additions and deletions all
 * count, because any of them makes the fork meaningfully different.
 */
export function countChangedQuestions(
  a: Parameters<typeof questionFingerprint>[0][],
  b: Parameters<typeof questionFingerprint>[0][]
): number {
  const multiset = (arr: Parameters<typeof questionFingerprint>[0][]) => {
    const m = new Map<string, number>();
    for (const q of arr) {
      const f = questionFingerprint(q);
      m.set(f, (m.get(f) || 0) + 1);
    }
    return m;
  };
  const ma = multiset(a);
  const mb = multiset(b);
  let common = 0;
  for (const [f, ca] of ma) common += Math.min(ca, mb.get(f) || 0);
  return Math.max(a.length, b.length) - common;
}

// Load the question set used for the fork-diff: the candidate new set when the
// save carries questions, otherwise the set currently stored in the DB.
async function effectiveQuestionSet(
  testId: string,
  incoming: CreateTestInput["questions"] | undefined
) {
  if (Array.isArray(incoming)) return incoming;
  const rows = await db.question.findMany({
    where: { testId },
    select: { text: true, optionA: true, optionB: true, optionC: true, optionD: true, optionE: true, correctAnswer: true },
  });
  return rows;
}

/**
 * The version-tree payload: the WHOLE family of the given test (the trunk
 * plus every descendant branch), each node with its creator — the client
 * renders trunk → branches → apples and can re-root the view at any node.
 */
export async function getTestTree(id: string) {
  const test = await db.test.findUnique({
    where: { id },
    select: { id: true, rootId: true, parentId: true },
  });
  if (!test) throw ApiError.notFound("Test not found");
  const famRoot = test.rootId || test.id;
  const nodes = await db.test.findMany({
    where: { OR: [{ id: famRoot }, { rootId: famRoot }, { id: test.id }] },
    select: {
      id: true,
      title: true,
      description: true,
      topic: true,
      coverIcon: true,
      coverColor: true,
      parentId: true,
      rootId: true,
      changedCount: true,
      versionName: true,
      createdAt: true,
      creatorId: true,
      creator: { select: { id: true, name: true, image: true } },
      tags: true,
      _count: { select: { questions: true, attachments: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 500, // hard cap — a family can never hang the endpoint
  });
  return { rootId: famRoot, nodes };
}

// ------------------------------------------------------------- version name --

/**
 * The naming dialog's endpoint: the author gives this test its VERSION NAME
 * (the first save / the first share-by-link). Creator-only, content-agnostic
 * — no questions payload, no fork gates. The card TITLE is deliberately NOT
 * touched: the personal-library one-name-per-family rule relies on it.
 */
export async function setTestVersionName(
  userId: string,
  id: string,
  body: { versionName: string }
) {
  const clean = (body.versionName || "").trim().slice(0, 200);
  if (!clean) throw ApiError.badRequest("Version name is required");
  const test = await db.test.findUnique({
    where: { id },
    select: { id: true, creatorId: true },
  });
  if (!test) throw ApiError.notFound("Test not found");
  if (test.creatorId !== userId) {
    throw ApiError.forbidden("Not allowed: only the author can name this test");
  }
  return db.test.update({
    where: { id },
    data: { versionName: clean },
    select: { id: true, versionName: true },
  });
}

// ---------------------------------------------------------------------- notes --

/** All notes written about a test (the API stays for compatibility — the
 * version-tree UI no longer renders notes). */
export async function listTestNotes(testId: string) {
  return db.testNote.findMany({
    where: { testId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, image: true } } },
  });
}

/** Create a note about a test — the alternative to a trivial fork. */
export async function createTestNote(userId: string, testId: string, text: string) {
  const clean = (text || "").trim().slice(0, 2000);
  if (!clean) throw ApiError.badRequest("Note text is required");
  const test = await db.test.findUnique({ where: { id: testId }, select: { id: true } });
  if (!test) throw ApiError.notFound("Test not found");
  return db.testNote.create({
    data: { testId, userId, text: clean },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
}

// -------------------------------------------------------------------- create --

export async function createTest(userId: string, body: CreateTestInput) {
  const {
    title,
    description,
    topic,
    isPublic,
    randomizeQuestions,
    randomizeOptions,
    questions,
    attachments,
    tags,
    coverIcon,
    coverColor,
  } = body;

  const cleanTags = sanitizeTags(tags);
  const cleanIcon = cleanCoverIcon(coverIcon);
  const cleanColor = cleanCoverColor(coverColor);

  // NAME RULE (product): a NEW test can never use a title that ANY test in
  // the community (public) library already uses — no matter whether the new
  // test itself is created public or link-only. Same-name tests would be
  // indistinguishable in search, in the feed and in every library view.
  if (title) {
    const clash = await findPublicTitleClash(title);
    if (clash) {
      throw ApiError.conflict("PUBLISH_NAME_TAKEN");
    }
  }

  const test = await db.test.create({
    data: {
      title,
      description: description || "",
      topic: topic || "Chemistry",
      tags: cleanTags,
      coverIcon: cleanIcon,
      coverColor: cleanColor,
      creatorId: userId,
      isPublic: isPublic !== false,
      randomizeQuestions: randomizeQuestions || false,
      randomizeOptions: randomizeOptions || false,
      questions: {
        create: (questions || []).map((q, index) => questionCreateData(q, index)),
      },
      ...(Array.isArray(attachments) &&
        attachments.length > 0 && {
          attachments: {
            create: attachments.map((a, index) => ({
              title: a.title || "Attachment",
              type: a.type || "link",
              url: a.url,
              size: a.size ?? null,
              tgMessageId: typeof a.tgMessageId === "number" ? a.tgMessageId : null,
              orderNum: a.orderNum ?? index,
            })),
          },
        }),
    },
    include: {
      questions: true,
      attachments: { orderBy: { orderNum: "asc" } },
      creator: { select: { id: true, name: true } },
    },
  });

  // Store new tags in the global dictionary for future autocomplete
  await ensureTagsExist(cleanTags);

  // AI TEST PASSPORT — generated UNDER THE HOOD in the very beginning of the
  // test's life: the AI reads the questions/files and grades difficulty /
  // cross-subject / quality for the «Обсудить с ИИ» metric cards. Best-effort
  // + off the critical path (the create response returns immediately; a failed
  // generation retries lazily on the first /metrics read).
  after(async () => {
    await generateAiMetrics(test.id);
  });

  // Content archive: the whole test as a JSON file in the Telegram channel.
  // BEST-EFFORT + OFF THE CRITICAL PATH: the create request returns the full
  // test IMMEDIATELY (Telegram round trips can take seconds — the create
  // button must work instantly, not at Telegram's pace). The archive lands
  // in the background; if it fails, the next save retries it anyway.
  after(async () => {
    try {
      const archive = await uploadTestArchive(test);
      await db.test.update({
        where: { id: test.id },
        data: { archiveId: archive.archiveId, archiveMsgId: archive.archiveMsgId },
      });
    } catch (e) {
      console.error("Test archive upload failed (create):", e);
    }
  });

  return { body: test, status: 201 };
}

// -------------------------------------------------------------------- update --

export async function updateTest(
  userId: string,
  id: string,
  body: UpdateTestInput
) {
  const existing = await db.test.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Test not found");
  // Editing is CREATOR-ONLY: a test that belongs to somebody else can never
  // be changed in place — the client copies it into the requester's own
  // library first (POST /api/tests/[id]/copy) and edits that copy.
  if (existing.creatorId !== userId) {
    throw ApiError.forbidden(
      "Not allowed: this test belongs to another author — edit your copy of it"
    );
  }

  const {
    title,
    description,
    topic,
    isPublic,
    randomizeQuestions,
    randomizeOptions,
    questions,
    attachments,
    tags,
    coverIcon,
    coverColor,
    versionName,
  } = body;

  // Publishing rule: a test can go PUBLIC only under a title that no other
  // public test in the community library currently uses.
  // NAME RULE (generalization): renaming a NON-version test to a title that
  // any public test already uses is rejected too — the same indistinguishable
  // -cards problem as at creation. Versions keep their source's title family
  // and are link-only, so a rename (rare) stays unchecked for them.
  // Version rule: a VERSION (a copy of somebody's test) is NEVER public —
  // it lives outside the community library and is shared by link only. The
  // flag is silently coerced so a stray editor toggle can never leak a
  // version into the public feed.
  const isVersion = !!existing.parentId;
  const effectivePublic =
    (isPublic !== undefined ? isPublic === true : existing.isPublic) && !isVersion;
  const titleChanging =
    !!title && title.trim().toLowerCase() !== (existing.title || "").trim().toLowerCase();
  const needsNameCheck = (!!effectivePublic && !!title) || (titleChanging && !isVersion);
  if (needsNameCheck && title) {
    const clash = await findPublicTitleClash(title, id);
    if (clash) {
      throw ApiError.conflict("PUBLISH_NAME_TAKEN");
    }
  }

  // Fork-diff gate: a VERSION must differ from its direct parent in at least
  // MIN_FORK_CHANGED_QUESTIONS questions/answers. Anything smaller is not a
  // new version — the client catches the VERSION_TOO_SIMILAR error and shows
  // the rule dialog ("change 2+ questions"). The exact change count is ALSO
  // persisted (Test.changedCount) — it drives the two states of the card's
  // "Share link" button (active ≥ 2 / passive < 2). (The parent may be gone —
  // a deleted ancestor — in which case the copy has become its own trunk.)
  let versionChangedCount: number | null = null;
  if (isVersion) {
    const parent = existing.parentId
      ? await db.test.findUnique({
          where: { id: existing.parentId },
          select: {
            id: true,
            questions: {
              select: { text: true, optionA: true, optionB: true, optionC: true, optionD: true, optionE: true, correctAnswer: true },
            },
          },
        })
      : null;
    if (parent) {
      const candidate = await effectiveQuestionSet(id, body.questions);
      const changed = countChangedQuestions(candidate as any, parent.questions as any);
      if (changed < MIN_FORK_CHANGED_QUESTIONS) {
        throw ApiError.forbidden("VERSION_TOO_SIMILAR");
      }
      versionChangedCount = changed;
    }
  }

  // Clean optional cover overrides: empty string clears the stored value
  const cleanIcon =
    coverIcon !== undefined ? cleanCoverIcon(coverIcon) : undefined;
  const cleanColor =
    coverColor !== undefined ? cleanCoverColor(coverColor) : undefined;

  // Replace attachments if provided (full list from the editor)
  if (Array.isArray(attachments)) {
    // Diff BEFORE the wipe: attachments the user removed in the editor must
    // ALSO disappear from the Telegram channel, not just from the DB.
    const existingAttachments = await db.attachment.findMany({
      where: { testId: id },
      select: { url: true, tgMessageId: true },
    });
    const keptUrls = new Set<string>(
      attachments.map((a) => String(a.url || ""))
    );
    const removedTg = existingAttachments.filter(
      (a) => a.url.startsWith("tg:") && !keptUrls.has(a.url)
    );

    await db.attachment.deleteMany({ where: { testId: id } });
    if (attachments.length > 0) {
      await db.attachment.createMany({
        data: attachments.map((a, index) => ({
          testId: id,
          title: a.title || "Attachment",
          type: a.type || "link",
          url: a.url,
          size: a.size ?? null,
          tgMessageId: typeof a.tgMessageId === "number" ? a.tgMessageId : null,
          orderNum: a.orderNum ?? index,
        })),
      });
    }

    // Best-effort channel cleanup (rows saved before tgMessageId bookkeeping
    // cannot be removed — the Bot API cannot look up a message by file_id).
    await Promise.allSettled(
      removedTg.map((a) => telegramDeleteFile(a.url.slice(3), a.tgMessageId))
    );
  }

  // Delete existing questions and recreate
  if (questions) {
    // Diff BEFORE the wipe: question photos the user removed/replaced in the
    // editor must ALSO disappear from the Telegram channel (best-effort).
    const oldQs = await db.question.findMany({
      where: { testId: id },
      select: { imageUrl: true, imageMsgId: true, optionImages: true },
    });
    const removedPhotos = removedQuestionPhotos(oldQs, questions);
    await db.question.deleteMany({ where: { testId: id } });
    if (removedPhotos.length) {
      await Promise.allSettled(
        removedPhotos.map((p) => telegramDeleteFile(p.fileId, p.msgId))
      );
    }
  }

  const test = await db.test.update({
    where: { id },
    data: {
      ...(title && { title }),
      ...(description !== undefined && { description }),
      ...(topic && { topic }),
      ...(Array.isArray(tags) && { tags: sanitizeTags(tags) }),
      ...(cleanIcon !== undefined && { coverIcon: cleanIcon }),
      ...(cleanColor !== undefined && { coverColor: cleanColor }),
      // The version's own name from the naming dialog (first save)
      ...(versionName !== undefined && {
        versionName: (versionName || "").trim().slice(0, 200) || null,
      }),
      ...(isPublic !== undefined && { isPublic: isVersion ? false : isPublic }),
      ...(randomizeQuestions !== undefined && { randomizeQuestions }),
      ...(randomizeOptions !== undefined && { randomizeOptions }),
      // Persist the fork-diff result so the card can decide the share-link
      // button state without re-diffing questions on every render.
      ...(isVersion && versionChangedCount !== null && { changedCount: versionChangedCount }),
      ...(questions && {
        questions: {
          create: questions.map((q, index) => questionCreateData(q, index)),
        },
      }),
    },
    include: {
      questions: { orderBy: { orderNum: "asc" } },
      attachments: { orderBy: { orderNum: "asc" } },
      creator: { select: { id: true, name: true } },
    },
  });

  // Store new tags in the global dictionary for future autocomplete
  if (Array.isArray(tags)) await ensureTagsExist(test.tags);

  // Content archive: replace the JSON file in the Telegram channel on EVERY
  // save — the old file's post is deleted so the channel holds exactly one
  // current archive per test. Best-effort AND OFF THE CRITICAL PATH: the
  // save request returns the full updated test IMMEDIATELY (the editor must
  // not wait on Telegram); the previous archive stays until the new one lands.
  after(async () => {
    try {
      const archive = await uploadTestArchive(test);
      await db.test.update({
        where: { id },
        data: {
          archiveId: archive.archiveId,
          archiveMsgId: archive.archiveMsgId,
        },
      });
      await deleteTestArchive(existing); // old file (existing row carried the refs)
    } catch (e) {
      console.error("Test archive upload failed (update):", e);
    }
  });

  return test;
}

// -------------------------------------------------------------------- delete --

export async function deleteTest(userId: string, id: string) {
  const existing = await db.test.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Test not found");
  if (existing.creatorId !== userId) {
    throw ApiError.forbidden("Not authorized");
  }

  // Bookkeeping BEFORE the row disappears: every attachment stored in the
  // Telegram channel must be removed from the channel too. DB rows,
  // bookmarks, chat messages and attempts all go away with the cascading
  // delete, so the test also leaves every community library at once.
  const channelFiles = await db.attachment.findMany({
    where: { testId: id, url: { startsWith: "tg:" } },
    select: { url: true, tgMessageId: true },
  });
  const qPhotos = await db.question.findMany({
    where: { testId: id },
    select: { imageUrl: true, imageMsgId: true, optionImages: true },
  });
  const channelPhotos = removedQuestionPhotos(qPhotos, []);

  await db.test.delete({ where: { id } });

  await Promise.allSettled([
    ...channelFiles.map((a) => telegramDeleteFile(a.url.slice(3), a.tgMessageId)),
    ...channelPhotos.map((p) => telegramDeleteFile(p.fileId, p.msgId)),
    // The content archive is the test's own file — it must not outlive it
    telegramDeleteFile(existing.archiveId || "", existing.archiveMsgId ?? null),
  ]);

  return { success: true };
}

// ----------------------------------------------------------------------- copy --

export async function copyTest(userId: string, id: string) {
  const source = await db.test.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { orderNum: "asc" } },
      attachments: { orderBy: { orderNum: "asc" } },
    },
  });
  if (!source) throw ApiError.notFound("Test not found");

  // --- name: the modified test keeps the SOURCE's exact name ---------------
  // The personal library shows AT MOST ONE test per name: the modified copy
  // carries the original's title so the library collapses the pair down to
  // the modified card (see feed.service — personal-library name rule).
  // Versions are private and can never be published (VERSION_NOT_PUBLIC),
  // so the public-name-uniqueness loop does not apply here.
  const title = source.title;

  const copy = await db.test.create({
    data: {
      title,
      description: source.description,
      topic: source.topic,
      tags: source.tags,
      coverIcon: source.coverIcon,
      coverColor: source.coverColor,
      creatorId: userId,
      isPublic: false, // private until the owner publishes it under its unique name
      // Version linkage: the copy is a VERSION of the source — it joins the
      // source's tree (rootId = the family trunk) and never appears in the
      // community library.
      parentId: source.id,
      rootId: source.rootId || source.id,
      randomizeQuestions: source.randomizeQuestions,
      randomizeOptions: source.randomizeOptions,
      questions: {
        create: source.questions.map((q, index) => ({
          text: q.text,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          optionE: q.optionE,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          translations: q.translations ?? undefined,
          imageNumber: q.imageNumber,
          // Photos: same tg: references as attachments — the copy shares the
          // channel posts with the original (bytes live once in the channel)
          imageUrl: q.imageUrl,
          imageMsgId: q.imageMsgId,
          optionImages: q.optionImages ?? undefined,
          orderNum: index,
        })),
      },
      attachments: source.attachments.length
        ? {
            create: source.attachments.map((a, index) => ({
              title: a.title,
              type: a.type,
              url: a.url, // tg: references / data: URLs / external links — all reusable
              size: a.size,
              tgMessageId: a.tgMessageId, // keeps the channel post traceable in the copy
              orderNum: a.orderNum ?? index,
            })),
          }
        : undefined,
    },
    include: {
      questions: { orderBy: { orderNum: "asc" } },
      attachments: { orderBy: { orderNum: "asc" } },
      creator: { select: { id: true, name: true } },
      _count: { select: { attempts: true } },
    },
  });

  // The modified test joins the personal library PINNED automatically — the
  // same treatment as a test saved with the bookmark button: the card shows
  // the «закреплено» marker (the filled pin on the author strip) without the
  // user doing anything. Idempotent upsert, safe to repeat.
  await db.bookmark.upsert({
    where: { userId_testId: { userId, testId: copy.id } },
    update: {},
    create: { userId, testId: copy.id },
  });

  // The copy gets its OWN content archive in the Telegram channel (the
  // original's archive keeps describing the original). Best-effort.
  // ALSO off the critical path: the copy's own AI passport (a version has
  // different questions — it deserves its own difficulty/quality grades).
  after(async () => {
    await generateAiMetrics(copy.id);
  });
  let finalCopy = copy;
  try {
    const archive = await uploadTestArchive(copy);
    finalCopy = await db.test.update({
      where: { id: copy.id },
      data: { archiveId: archive.archiveId, archiveMsgId: archive.archiveMsgId },
      include: {
        questions: { orderBy: { orderNum: "asc" } },
        attachments: { orderBy: { orderNum: "asc" } },
        creator: { select: { id: true, name: true } },
        _count: { select: { attempts: true } },
      },
    });
  } catch (e) {
    console.error("Test archive upload failed (copy):", e);
  }

  return finalCopy;
}

// ---------------------------------------------------------------------- share --

export async function shareTest(userId: string, id: string, body: ShareInput) {
  const scope = body.scope;

  const test = await db.test.findUnique({
    where: { id },
    select: { id: true, creatorId: true, isPublic: true, parentId: true },
  });
  if (!test) throw ApiError.notFound("Test not found");

  // ---- version rules ----------------------------------------------------
  // A VERSION (a copy of somebody's test) lives OUTSIDE the community library:
  //   * community publishing is impossible — the error tells the user why;
  //   * link sharing requires a real contribution: at least
  //     MIN_FORK_CHANGED_QUESTIONS questions/answers changed vs the direct
  //     parent, otherwise the client offers to write a NOTE instead.
  if (test.parentId) {
    if (scope === "community") {
      throw ApiError.forbidden("VERSION_NOT_PUBLIC");
    }
    const parent = await db.test.findUnique({
      where: { id: test.parentId },
      select: {
        questions: {
          select: { text: true, optionA: true, optionB: true, optionC: true, optionD: true, optionE: true, correctAnswer: true },
        },
      },
    });
    if (parent) {
      const mine = await db.question.findMany({
        where: { testId: id },
        select: { text: true, optionA: true, optionB: true, optionC: true, optionD: true, optionE: true, correctAnswer: true },
      });
      const changed = countChangedQuestions(mine as any, parent.questions as any);
      if (changed < MIN_FORK_CHANGED_QUESTIONS) {
        throw ApiError.forbidden("VERSION_TOO_SIMILAR");
      }
    }
    // Allowed link-share of a version — no isPublic flip (stays private)
    return { ok: true, isPublic: test.isPublic };
  }

  if (test.creatorId === userId) {
    if (scope === "community" && !test.isPublic) {
      // Publishing rule: a test can go PUBLIC only under a title that no
      // other public test in the community library uses.
      const full = await db.test.findUnique({
        where: { id },
        select: { title: true },
      });
      const clash = await findPublicTitleClash(full?.title || "", id);
      if (clash) {
        throw ApiError.conflict("PUBLISH_NAME_TAKEN");
      }
      await db.test.update({ where: { id }, data: { isPublic: true } });
      return { ok: true, isPublic: true };
    }
    if (scope === "link" && test.isPublic) {
      await db.test.update({ where: { id }, data: { isPublic: false } });
      return { ok: true, isPublic: false };
    }
  }

  return { ok: true, isPublic: test.isPublic };
}

// -------------------------------------------------------------------- archive --

/**
 * Streams the test's content archive (the JSON file stored in the Telegram
 * channel). Creator can always download; everybody else only when the test
 * is public; no archive yet → 404.
 */
export async function streamTestArchive(userId: string, id: string): Promise<Response> {
  const test = await db.test.findUnique({
    where: { id },
    select: {
      title: true,
      isPublic: true,
      creatorId: true,
      archiveId: true,
    },
  });
  if (!test) return new Response("Test not found", { status: 404 });
  if (test.creatorId !== userId && !test.isPublic) {
    return new Response("Not authorized", { status: 403 });
  }
  if (!test.archiveId) {
    return new Response(
      "No archive file for this test yet (save it once to create one)",
      { status: 404 }
    );
  }

  const direct = await telegramFileUrl(test.archiveId);
  const upstream = await fetch(direct, { redirect: "follow" });
  if (!upstream.ok || !upstream.body) {
    return new Response("Archive fetch failed", { status: 502 });
  }

  // Readable, header-safe file name: the title with non-word chars collapsed
  const safeTitle =
    (test.title || "test").replace(/[^\p{L}\p{N}\-_ ]+/gu, " ").trim().slice(0, 60) ||
    "test";
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(safeTitle)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

// -------------------------------------------------------------- translations --

export async function saveTranslations(
  userId: string,
  testId: string,
  body: SaveTranslationsInput
) {
  const { lang, items } = body;

  const questions = await db.question.findMany({
    where: {
      testId,
      id: { in: items.map((it) => it.id).filter(Boolean) },
    },
    select: { id: true, translations: true },
  });
  const existing = new Map<string, Record<string, unknown>>(
    questions.map((q) => [
      q.id,
      (q.translations && typeof q.translations === "object"
        ? q.translations
        : {}) as Record<string, unknown>,
    ])
  );

  let saved = 0;
  const CHUNK = 8;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items
      .slice(i, i + CHUNK)
      .filter((it) => existing.has(it.id));
    await Promise.all(
      chunk.map(async (it) => {
        const base = { ...(existing.get(it.id) || {}) } as Record<string, unknown>;
        const entry: Record<string, unknown> = {
          ...(base[lang] as Record<string, unknown> | undefined),
        };
        if (typeof it.text === "string" && it.text.trim()) entry.text = it.text;
        if (it.options && typeof it.options === "object") {
          const opts: Record<string, string> = {};
          for (const L of ["A", "B", "C", "D", "E"]) {
            const v = it.options[L];
            if (typeof v === "string" && v.trim()) opts[L] = v;
          }
          if (Object.keys(opts).length) entry.options = opts;
        }
        if (typeof it.explanation === "string" && it.explanation.trim())
          entry.explanation = it.explanation;
        if (!Object.keys(entry).length) return;
        base[lang] = entry;
        await db.question.update({
          where: { id: it.id },
          data: { translations: base as unknown as Prisma.InputJsonValue },
        });
        existing.set(it.id, base);
        saved++;
      })
    );
  }

  return { ok: true, saved };
}
