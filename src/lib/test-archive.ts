/**
 * Test content archive — the test's questions and answers as a JSON FILE in
 * the Telegram channel.
 *
 * Every save (create / edit / copy) serializes the whole test content and
 * uploads it as a document (`test-<id>.json`) via sendDocument. The DB row
 * keeps only the reference (archiveId + archiveMsgId); when a test is edited
 * the previous file's channel post is deleted, so the channel always holds
 * exactly ONE current archive per test.
 *
 * What lives in the file:
 *   - test meta: title, description, topic, tags, isPublic, randomize flags,
 *     cover overrides
 *   - every question: text, options A–E, correctAnswer, explanation,
 *     interface-language translations, photo references (`tg:` file ids are
 *     portable — the photos themselves live in the same channel)
 *
 * The archive is a BACKUP / portable copy, not the read path: the Neon rows
 * stay the source of truth the site serves from (fast, queryable), while the
 * file makes the content recoverable and inspectable in Telegram. GET
 * /api/tests/[id]/archive streams it back ("load into the site's memory when
 * needed").
 */

import { telegramUpload, telegramDeleteFile } from '@/lib/telegram';

export type ArchiveQuestion = {
  text: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  optionE?: string | null;
  correctAnswer: string;
  explanation?: string | null;
  translations?: unknown;
  imageNumber?: number | null;
  imageUrl?: string | null;
  optionImages?: unknown;
};

export type ArchiveTest = {
  id: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  tags?: string[];
  isPublic?: boolean;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  coverIcon?: string | null;
  coverColor?: string | null;
  questions: ArchiveQuestion[];
};

export function buildTestArchive(test: ArchiveTest): { name: string; buffer: Buffer } {
  const payload = {
    format: 'uuu-test-archive',
    version: 1,
    exportedAt: new Date().toISOString(),
    test: {
      id: test.id,
      title: test.title,
      description: test.description || '',
      topic: test.topic || null,
      tags: test.tags || [],
      isPublic: test.isPublic ?? true,
      randomizeQuestions: test.randomizeQuestions ?? false,
      randomizeOptions: test.randomizeOptions ?? false,
      coverIcon: test.coverIcon ?? null,
      coverColor: test.coverColor ?? null,
    },
    questions: (test.questions || []).map((q, index) => ({
      orderNum: index,
      text: q.text,
      options: {
        A: q.optionA,
        B: q.optionB,
        C: q.optionC,
        D: q.optionD,
        E: q.optionE || null,
      },
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      translations: q.translations ?? null,
      imageNumber: q.imageNumber ?? null,
      photo: q.imageUrl ?? null, // `tg:<file_id>` / data: / https: — photos live in the same channel
      optionPhotos: q.optionImages ?? null,
    })),
  };
  const json = JSON.stringify(payload, null, 2);
  return {
    name: `test-${test.id}.json`,
    buffer: Buffer.from(json, 'utf8'),
  };
}

export type ArchiveRefs = { archiveId: string; archiveMsgId: number | null };

/**
 * Serialize + upload the archive. Throws on Telegram errors — callers wrap it
 * in try/catch (archiving must never fail a save).
 */
export async function uploadTestArchive(test: ArchiveTest): Promise<ArchiveRefs> {
  const { name, buffer } = buildTestArchive(test);
  const res = await telegramUpload({
    name,
    buffer,
    contentType: 'application/json',
  });
  return { archiveId: res.fileId, archiveMsgId: res.messageId };
}

/** Delete the current archive's channel post (best-effort, silent). */
export async function deleteTestArchive(refs: { archiveId?: string | null; archiveMsgId?: number | null } | null | undefined): Promise<boolean> {
  if (!refs?.archiveId) return false;
  return telegramDeleteFile(refs.archiveId, refs.archiveMsgId ?? null);
}
