// ---------------------------------------------------------------------------
// Attempts service — taking tests.
//   GET  /api/attempts        → the caller's attempts (with test titles)
//   POST /api/attempts        → start an attempt (recommendation signal: +4)
//   GET  /api/attempts/[id]   → one attempt, OWNER-ONLY (was public before —
//                               answers to every question leaked to anyone
//                               with the id; the frontend never calls it for
//                               foreign attempts)
//   PUT  /api/attempts/[id]   → save answers / complete (owner-only, unchanged)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { bumpAffinity } from "@/lib/affinity";
import { ApiError } from "@/server/http/errors";

export async function listAttempts(userId: string) {
  return db.testAttempt.findMany({
    where: { userId },
    include: {
      test: {
        select: { id: true, title: true, topic: true },
      },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function createAttempt(
  userId: string,
  input: { testId: string; totalQuestions?: number }
) {
  const test = await db.test.findUnique({
    where: { id: input.testId },
    include: { questions: true },
  });
  if (!test) throw ApiError.notFound("Test not found");

  // Use the requested total if provided and valid, otherwise full test length
  const totalQ =
    input.totalQuestions && input.totalQuestions > 0 && input.totalQuestions <= test.questions.length
      ? input.totalQuestions
      : test.questions.length;

  const attempt = await db.testAttempt.create({
    data: {
      testId: input.testId,
      userId,
      totalQuestions: totalQ,
    },
  });

  // Recommendation signal: starting a test is a strong interest indicator
  bumpAffinity(
    userId,
    (test.tags || []).concat(test.topic ? [test.topic] : []),
    4
  ).catch(() => {});

  return attempt;
}

async function requireOwnedAttempt(attemptId: string, userId: string) {
  const attempt = await db.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: { include: { questions: true } } },
  });
  if (!attempt) throw ApiError.notFound("Attempt not found");
  if (attempt.userId !== userId) throw ApiError.forbidden("Not authorized");
  return attempt;
}

export async function getAttempt(attemptId: string, userId: string) {
  const attempt = await requireOwnedAttempt(attemptId, userId);
  const full = await db.testAttempt.findUnique({
    where: { id: attempt.id },
    include: {
      test: { include: { questions: { orderBy: { orderNum: "asc" } } } },
      answers: { include: { question: true } },
    },
  });
  return full;
}

export async function updateAttempt(
  attemptId: string,
  userId: string,
  input: {
    answers?: { questionId: string; selectedAnswer: string; isCorrect?: boolean }[];
    completed?: boolean;
  }
) {
  const attempt = await requireOwnedAttempt(attemptId, userId);
  const { answers, completed } = input;

  // Grade on the SERVER. The client's `isCorrect` is accepted for backward
  // compatibility but IGNORED — a tampered client must not be able to write
  // a perfect score. Answers that do not belong to this attempt's test are
  // dropped (cross-test injection guard).
  let graded: {
    attemptId: string;
    questionId: string;
    selectedAnswer: string;
    isCorrect: boolean;
  }[] = [];
  if (answers && answers.length > 0) {
    const qs = await db.question.findMany({
      where: {
        id: { in: answers.map((a) => a.questionId) },
        testId: attempt.testId,
      },
      select: { id: true, correctAnswer: true },
    });
    const correctById = new Map(qs.map((q) => [q.id, q.correctAnswer]));
    graded = answers
      .filter((a) => correctById.has(a.questionId))
      .map((a) => ({
        attemptId,
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer,
        isCorrect: a.selectedAnswer === correctById.get(a.questionId),
      }));
    await db.$transaction([
      db.attemptAnswer.deleteMany({ where: { attemptId } }),
      db.attemptAnswer.createMany({ data: graded }),
    ]);
  }

  // Complete the attempt
  if (completed) {
    // Fresh answers submitted → grade them; otherwise re-count the stored
    // rows (server-graded since this change).
    const score = graded.length
      ? graded.filter((g) => g.isCorrect).length
      : await db.attemptAnswer.count({ where: { attemptId, isCorrect: true } });

    // Use the number of answers as totalQuestions (may be less than the full
    // test when the user selected fewer questions)
    const totalQ = graded.length
      ? graded.length
      : attempt.totalQuestions;

    await db.testAttempt.update({
      where: { id: attemptId },
      data: {
        completed: true,
        score,
        totalQuestions: totalQ,
        completedAt: new Date(),
      },
    });

    // Recommendation signal: completing a test is the strongest interest
    // indicator, weighted by engagement time and difficulty (see Task 10)
    if (attempt.test) {
      const minutes = attempt.startedAt
        ? (Date.now() - new Date(attempt.startedAt).getTime()) / 60000
        : 0;
      const answered = graded.length
        ? graded.length
        : attempt.totalQuestions || 0;
      const accuracy = answered > 0 ? score / answered : 1;
      const delta = Math.min(
        12,
        6 + Math.min(4, minutes / 3) + (accuracy < 0.6 ? 2 : 0)
      );
      bumpAffinity(
        userId,
        (attempt.test.tags || []).concat(attempt.test.topic ? [attempt.test.topic] : []),
        delta
      ).catch(() => {});
    }
  }

  return db.testAttempt.findUnique({
    where: { id: attemptId },
    include: { test: true, answers: { include: { question: true } } },
  });
}
