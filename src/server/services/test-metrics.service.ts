// ---------------------------------------------------------------------------
// TEST METRICS — the AI test passport.
//
// Created UNDER THE HOOD in the very beginning of the test's life: when a
// test is created (or copied as a version), the AI reads the questions,
// options, correct answers, explanations and the attached files and grades
// the test on 0-100 scales:
//
//   difficulty    — how hard the test is;
//   crossSubject  — how many disciplines the questions span;
//   quality       — question quality (wording, distractors, explanations).
//
// The SITE metrics (how many people already took the test, the all-time
// record, the average score, how well THIS user knows the topic) are NOT
// stored — they are aggregated live from the attempts at read time, so the
// passport cards always show the current truth.
//
// If the AI chain fails or times out, a deterministic heuristic grades the
// test instead — the passport cards NEVER render empty (genSource="ai" vs
// "heuristic" tells the two apart).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { aiChat } from "@/lib/ai";
import { ApiError } from "@/server/http/errors";

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

const pct = (score: number, total: number) =>
  total > 0 ? clamp100((score / total) * 100) : 0;

// In-process dedupe: parallel reads of the same ungenerated test share one
// AI call instead of racing (serverless instances each keep their own map —
// the TestMetrics unique constraint covers the rest).
const inflight = new Map<string, Promise<void>>();

/* ------------------------------------------------------------- heuristics -- */

function heuristicGrades(
  test: { topic: string; tags: string[] },
  questions: { text: string; optionE: string | null; explanation: string | null }[],
  attachments: number
) {
  const n = Math.max(1, questions.length);
  const avgLen =
    questions.reduce((s, q) => s + (q.text || "").length, 0) / n;
  const explained = questions.filter((q) => (q.explanation || "").trim().length > 12).length / n;
  const fiveOption = questions.filter((q) => !!q.optionE).length / n;

  // Difficulty: longer texts, 5-option questions and missing explanations
  // all push the perceived hardness up; question count adds a little more.
  const difficulty = clamp100(
    30 + Math.min(28, avgLen / 7) + fiveOption * 12 + (1 - explained) * 14 + Math.min(12, n * 0.8)
  );

  // Cross-disciplinarity: distinct science words across topic + tags.
  const DISCIPLINES = [
    "math", "матем", "алгебр", "геометр",
    "phys", "физик", "fizik",
    "chem", "хим", "kimyo",
    "bio", "био",
    "hist", "истор", "tarix",
    "geo", "геогр", "geogra",
    "astr", "астр",
    "liter", "литер", "adabiy",
    "lang", "язык", "til",
    "inform", "информ",
    "eco", "эконом", "iqtisod",
  ];
  const words = [test.topic || "", ...(test.tags || [])].join(" ").toLowerCase();
  const distinct = new Set(DISCIPLINES.filter((d) => words.includes(d)));
  const crossSubject = clamp100(
    18 + distinct.size * 26 + (test.tags || []).length * 3 + (attachments > 0 ? 4 : 0)
  );

  // Quality: explanations + full option sets are the two signals we have.
  const quality = clamp100(
    24 + explained * 46 + (fiveOption * 0.5 + 0.5) * 22 + Math.min(8, n * 0.4)
  );

  return { difficulty, crossSubject, quality };
}

/* -------------------------------------------------------------- AI grading -- */

function extractJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function aiGrades(test: {
  title: string;
  topic: string;
  tags: string[];
  description: string;
}, questions: {
  text: string; optionA: string; optionB: string; optionC: string;
  optionD: string; optionE: string | null; correctAnswer: string;
  explanation: string | null;
}[], attachments: string[]) {
  const qDump = questions
    .slice(0, 30)
    .map((q, i) => {
      const opts = (["A", "B", "C", "D", "E"] as const)
        .map((l) => q[`option${l}`])
        .filter((o): o is string => !!o)
        .map((o) => o.slice(0, 70))
        .join(" | ");
      return [
        `${i + 1}. ${q.text.slice(0, 200)}`,
        opts ? `   options: ${opts}` : "",
        `   correct: ${q.correctAnswer}`,
        q.explanation ? `   explanation: ${q.explanation.slice(0, 140)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const files = attachments.length
    ? `Attached files (titles only): ${attachments.slice(0, 10).join("; ")}\n`
    : "";

  const prompt = `You are grading a school/university test for the site's AI test passport.
${files}Title: ${test.title}
Topic: ${test.topic}
Tags: ${(test.tags || []).join(", ") || "-"}
Description: ${(test.description || "").slice(0, 200) || "-"}
Questions (${questions.length} total, showing up to 30):
${qDump}

Grade the test on three independent 0-100 integer scales:
- "difficulty": how hard it is for the target student ( factual recall ≈ 30-50, multi-step problem solving ≈ 70-95);
- "crossSubject": how many DIFFERENT school disciplines the questions genuinely touch (single-topic test ≈ 15-40, strongly interdisciplinary ≈ 60-95);
- "quality": question quality — clear wording, plausible distractors, presence of explanations (poor ≈ 20-40, solid ≈ 55-75, excellent ≈ 80-95).

Also write "summary": ONE short sentence (max 90 chars) in the SAME language as the questions, describing what the test covers.

Answer with STRICT JSON only, no markdown, no extra keys:
{"difficulty": <int>, "crossSubject": <int>, "quality": <int>, "summary": "<one sentence>"}`;

  const { text } = await aiChat({
    messages: [
      { role: "system", content: "You are a strict but fair exam grader. You reply with JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 300,
  });

  const json = extractJson(text || "");
  if (!json) throw new Error("AI metrics: unparseable response");
  const difficulty = clamp100(Number(json.difficulty));
  const crossSubject = clamp100(Number(json.crossSubject));
  const quality = clamp100(Number(json.quality));
  if (!Number.isFinite(difficulty) || !Number.isFinite(crossSubject) || !Number.isFinite(quality)) {
    throw new Error("AI metrics: NaN grades");
  }
  const summary =
    typeof json.summary === "string" && json.summary.trim()
      ? json.summary.trim().slice(0, 160)
      : null;
  return { difficulty, crossSubject, quality, summary };
}

/** Generate (or regenerate) the AI passport of ONE test and store it.
 *  Falls back to the deterministic heuristic on any failure/timeout. */
export async function generateAiMetrics(testId: string): Promise<void> {
  const existing = inflight.get(testId);
  if (existing) return existing;

  const job = (async () => {
    const test = await db.test.findUnique({
      where: { id: testId },
      include: {
        questions: { orderBy: { orderNum: "asc" } },
        attachments: { select: { title: true } },
      },
    });
    if (!test) return;

    let grades: { difficulty: number; crossSubject: number; quality: number; summary: string | null };
    let source = "ai";
    try {
      grades = await Promise.race([
        aiGrades(test, test.questions, test.attachments.map((a) => a.title)),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("AI metrics timeout")), 22_000)),
      ]);
    } catch (e: any) {
      console.error(`[metrics] AI grading failed for ${testId}, heuristic fallback:`, e?.message || e);
      grades = {
        ...heuristicGrades(test, test.questions, test.attachments.length),
        summary: null,
      };
      source = "heuristic";
    }

    await db.testMetrics.upsert({
      where: { testId },
      create: { testId, ...grades, genSource: source },
      update: { ...grades, genSource: source },
    });
  })().catch((e) => {
    console.error(`[metrics] generation crashed for ${testId}:`, e);
  }).finally(() => inflight.delete(testId));

  inflight.set(testId, job);
  return job;
}

/** The passport row, generated on first read if creation-time generation
 *  has not landed yet (old tests, serverless kill, …). */
async function ensureMetrics(testId: string) {
  const row = await db.testMetrics.findUnique({ where: { testId } });
  if (row) return row;
  await generateAiMetrics(testId);
  return db.testMetrics.findUnique({ where: { testId } });
}

/* ----------------------------------------------------------------- readout -- */

export interface TestMetricsView {
  difficulty: number;
  crossSubject: number;
  quality: number;
  summary: string | null;
  genSource: string;
  // live site metrics
  timesTaken: number;
  recordScore: number | null; // best % in the test's history
  avgScore: number | null;    // mean % across completed attempts
  // personal metric (null for guests / zero history)
  userKnows: number | null;   // how well THIS user knows the test's topic
  questions: number;
}

export async function getTestMetricsView(
  testId: string,
  userId: string | null
): Promise<TestMetricsView> {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: {
      id: true,
      topic: true,
      _count: { select: { questions: true } },
    },
  });
  if (!test) throw ApiError.notFound("Test not found");

  const row = await ensureMetrics(testId);

  // ---- live site metrics: this test's completed attempts ------------------
  const attempts = await db.testAttempt.findMany({
    where: { testId, completed: true },
    select: { score: true, totalQuestions: true },
  });
  const pcts = attempts.map((a) => pct(a.score, a.totalQuestions));
  const timesTaken = attempts.length;
  const recordScore = pcts.length ? Math.max(...pcts) : null;
  const avgScore = pcts.length
    ? clamp100(pcts.reduce((s, v) => s + v, 0) / pcts.length)
    : null;

  // ---- personal metric: the viewer vs this TOPIC ---------------------------
  let userKnows: number | null = null;
  if (userId) {
    const mine = await db.testAttempt.findMany({
      where: { userId, completed: true, test: { topic: test.topic } },
      select: { score: true, totalQuestions: true },
      take: 500,
    });
    if (mine.length > 0) {
      const best = Math.max(...mine.map((a) => pct(a.score, a.totalQuestions)));
      // 75% skill (best score on the topic) + 25% practice (coverage bonus)
      userKnows = clamp100(best * 0.75 + Math.min(100, mine.length * 12) * 0.25);
    }
  }

  return {
    difficulty: row?.difficulty ?? 50,
    crossSubject: row?.crossSubject ?? 30,
    quality: row?.quality ?? 50,
    summary: row?.summary ?? null,
    genSource: row?.genSource ?? "heuristic",
    timesTaken,
    recordScore,
    avgScore,
    userKnows,
    questions: test._count.questions,
  };
}
