// ---------------------------------------------------------------------------
// AI service — the tutor chat (question explanations, follow-up dialogue) and
// the one-line explanation generator. The provider chain itself (Gemini →
// Google AI Mode scrape → Mistral) lives in src/lib/ai.ts.
//
// The tutor system prompts below are product IP: ground-truth answer handling,
// LaTeX-only math formatting rules and the wrong/correct answer flows are
// preserved exactly.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { aiChat } from "@/lib/ai";
import { isLang, LANG_FULL, Lang } from "@/lib/i18n";
import { ApiError } from "@/server/http/errors";
import type { aiChatSchema, explainSchema } from "@/server/schemas";
import type { z } from "zod";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // 2s, 5s, 10s

// Shared formatting contract of every tutor prompt (product IP — preserved
// verbatim). Lives at module scope so the test-level chat reuses the same
// rules.
const LATEX_RULE = `FORMATTING RULES (STRICT):
1. Write ALL math, formulas, and equations using LaTeX wrapped in dollar signs: inline math like $x^2 + 1$, $\\frac{a}{b}$, $A^{-1}$, and display equations on their own line like $$\\int_0^1 x^2 dx = \\frac{1}{3}$$. NEVER write math as plain text (no "x^2", no "a/b" for fractions). Matrices use \\begin{pmatrix} ... \\end{pmatrix}.
2. NEVER use \\(...\\) or \\[...\\] delimiters — only $...$ and $$...$$.
3. Do not use markdown headings (#). Use short bold labels like **Step 1:** when helpful. The interface renders LaTeX with KaTeX.`;

/**
 * Normalize math delimiters coming from the LLM.
 * Many models emit \( ... \) and \[ ... \] while the frontend renders $...$ / $$...$$.
 */
function normalizeMathNotation(text: string): string {
  if (!text) return text;
  // Protect LaTeX row separators "\\" (pmatrix rows) BEFORE delimiter
  // conversion, so "\\(" (rowsep + paren) is not mistaken for "\( ".
  const ROWSEP = '\u0002'; // STX sentinel: never appears in LLM prose
  let out = text.replace(/\\\\/g, ROWSEP);
  out = out
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$")
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => `$$${inner}$$`);
  return out.split(ROWSEP).join("\\\\");
}

async function callAIWithRetry(
  conversationMessages: { role: "system" | "user" | "assistant"; content: string }[],
  retries = MAX_RETRIES
): Promise<string> {
  try {
    // Provider chain: Gemini → Google AI Mode → Mistral (see src/lib/ai.ts)
    const { text } = await aiChat({
      messages: conversationMessages,
      temperature: 0.5,
      max_tokens: 1600,
    });
    return text || "Sorry, I could not generate a response.";
  } catch (error: any) {
    const isRateLimit =
      error?.message?.includes("429") ||
      error?.message?.includes("Too many requests") ||
      error?.message?.includes("rate");
    if (isRateLimit && retries > 0) {
      const delay = RETRY_DELAYS[MAX_RETRIES - retries];
      console.log(
        `Chat API rate limited, retrying in ${delay}ms... (${retries} retries left)`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callAIWithRetry(conversationMessages, retries - 1);
    }
    throw error;
  }
}

function sanitizeOptionValue(val: unknown): string | null {
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// --------------------------------------------------------------------- chat --

export async function tutorChat(
  userId: string,
  input: z.infer<typeof aiChatSchema>
) {
  const { questionId, userAnswer, messages, questionContext } = input;

  // Fetch the question from DB (used as fallback when no context is provided)
  const dbQuestion = await db.question.findUnique({
    where: { id: questionId },
    include: { test: { select: { title: true, topic: true } } },
  });

  if (!dbQuestion && !questionContext) {
    throw ApiError.notFound("Question not found");
  }

  // IMPORTANT: the client shuffles options before display, so the DB labels
  // may NOT match what the student sees. When the frontend provides
  // questionContext (the question exactly as displayed), always prefer it.
  const ctxText = sanitizeOptionValue(questionContext?.text);
  const ctxOptions =
    questionContext?.options && typeof questionContext.options === "object"
      ? questionContext.options
      : null;
  const ctxCorrect = /^[A-E]$/.test((questionContext?.correctAnswer || "").trim())
    ? questionContext!.correctAnswer.trim()
    : null;

  const questionText = ctxText || dbQuestion?.text || "Unknown question";

  const optionLabels = ["A", "B", "C", "D", "E"];
  const options: string[] = [];
  if (ctxOptions) {
    for (const label of optionLabels) {
      const val = sanitizeOptionValue(ctxOptions[label]);
      if (val) options.push(`${label}) ${val}`);
    }
  }
  // Fallback to DB options when the context has fewer than 2 options
  if (options.length < 2 && dbQuestion) {
    options.length = 0;
    for (const label of optionLabels) {
      const val = dbQuestion[`option${label}` as keyof typeof dbQuestion] as string | null;
      if (val) options.push(`${label}) ${val}`);
    }
  }

  const correctAnswer = ctxCorrect || dbQuestion?.correctAnswer || "A";
  const correctOptionText = ctxOptions
    ? sanitizeOptionValue(ctxOptions[correctAnswer])
    : dbQuestion
    ? (dbQuestion[`option${correctAnswer}` as keyof typeof dbQuestion] as string | null)
    : null;
  const correctDisplay = correctOptionText
    ? `${correctAnswer}) ${correctOptionText}`
    : correctAnswer;

  const userOptionText = userAnswer
    ? ctxOptions
      ? sanitizeOptionValue(ctxOptions[userAnswer]) || "Unknown option"
      : dbQuestion
      ? (dbQuestion[`option${userAnswer}` as keyof typeof dbQuestion] as string | null) ||
        "Unknown option"
      : "Unknown option"
    : null;

  const topic = questionContext?.topic || dbQuestion?.test?.topic || "General";
  const isCorrect = userAnswer === correctAnswer;

  const LATEX_RULE = `FORMATTING RULES (STRICT):
1. Write ALL math, formulas, and equations using LaTeX wrapped in dollar signs: inline math like $x^2 + 1$, $\\frac{a}{b}$, $A^{-1}$, and display equations on their own line like $$\\int_0^1 x^2 dx = \\frac{1}{3}$$. NEVER write math as plain text (no "x^2", no "a/b" for fractions). Matrices use \\begin{pmatrix} ... \\end{pmatrix}.
2. NEVER use \\( ... \\) or \\[ ... \\] delimiters — only $...$ and $$...$$.
3. Do not use markdown headings (#). Use short bold labels like **Step 1:** when helpful. The interface renders LaTeX with KaTeX.`;

  let systemPrompt: string;

  if (userAnswer && !isCorrect) {
    // User answered incorrectly - explain why their answer is wrong AND why
    // the correct one is right
    systemPrompt = `You are an expert AI tutor helping a student understand a test question. The student answered INCORRECTLY.

Question: ${questionText}
Options: ${options.join(" | ")}
Correct Answer: ${correctDisplay}
Student's Answer: ${userAnswer}) ${userOptionText}
Test Topic: ${topic}

ABSOLUTE RULE: The "Correct Answer" line above is GROUND TRUTH provided by the test system. It is ALWAYS correct — never question it, never suggest a different option is correct, and always refer to the correct answer by its letter (${correctAnswer}) and its text.

The student chose the WRONG answer. Explain:
1. Why the student's answer (${userAnswer}) is incorrect - what misconception or mistake led them there
2. Why the correct answer (${correctAnswer}) is the right choice - the key reasoning or fact

Be clear, educational, and supportive. Use the same language as the question. If it's a calculation, show the steps. If it's a concept, explain the underlying principle. Keep your initial response concise (2-3 sentences for each point), but be ready to elaborate if the student asks follow-up questions.

${LATEX_RULE}`;
  } else if (userAnswer && isCorrect) {
    // User answered correctly - explain why it's correct
    systemPrompt = `You are an expert AI tutor helping a student understand a test question. The student answered CORRECTLY.

Question: ${questionText}
Options: ${options.join(" | ")}
Correct Answer: ${correctDisplay}
Student's Answer: ${userAnswer}) ${userOptionText} (Correct!)
Test Topic: ${topic}

ABSOLUTE RULE: The "Correct Answer" line above is GROUND TRUTH provided by the test system. It is ALWAYS correct — never question it, never suggest a different option is correct, and always refer to the correct answer by its letter (${correctAnswer}) and its text.

The student chose the CORRECT answer. Confirm they are right and briefly explain WHY this answer is correct. Reinforce the key concept or principle. Keep it concise (1-2 sentences), but be ready to elaborate on follow-up questions.

${LATEX_RULE}`;
  } else {
    // No answer yet - just explain the question context
    systemPrompt = `You are an expert AI tutor. The student is looking at this test question:

Question: ${questionText}
Options: ${options.join(" | ")}
Test Topic: ${topic}

Help the student understand the concepts behind this question. Do NOT reveal the correct answer directly. Instead, guide them to think through it. Be educational and supportive.

${LATEX_RULE}`;
  }

  const conversationMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m: ChatTurn) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const aiResponse = await callAIWithRetry(conversationMessages);

  // Normalize \(...\) and \[...\] to $...$ / $$...$$ so the frontend renders them
  return { response: normalizeMathNotation(aiResponse) };
}

// -------------------------------------------------------- test-level chat --

/**
 * The AI chat that holds the WHOLE TEST as context — the conversation the
 * user lands in after the metrics passport («Обсудить с ИИ»). No concrete
 * question: the server loads the test (title, topic, tags, every question
 * with its options and the GROUND-TRUTH correct answer, the AI passport
 * scores) and builds the system prompt from it.
 */
export async function tutorChatAboutTest(
  userId: string,
  testId: string,
  messages: ChatTurn[]
) {
  const test = await db.test.findUnique({
    where: { id: testId },
    include: {
      questions: { orderBy: { orderNum: "asc" }, take: 60 },
      metrics: { select: { difficulty: true, crossSubject: true, quality: true } },
    },
  });
  if (!test) throw ApiError.notFound("Test not found");

  const qDump = test.questions
    .map((q, i) => {
      const opts = (["A", "B", "C", "D", "E"] as const)
        .map((l) => q[`option${l}` as keyof typeof q] as string | null)
        .filter(Boolean)
        .map((o) => o!.slice(0, 90))
        .join(" | ");
      return [
        `${i + 1}. ${q.text.slice(0, 300)}`,
        opts ? `   Options: ${opts}` : "",
        `   Correct: ${q.correctAnswer}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const passport = test.metrics
    ? `AI passport scores (0-100): difficulty ${test.metrics.difficulty ?? "?"}, cross-subject ${test.metrics.crossSubject ?? "?"}, quality ${test.metrics.quality ?? "?"}.`
    : "";

  const systemPrompt = `You are the AI tutor of the test "${test.title}" (topic: ${test.topic}${(test.tags || []).length ? `, tags: ${test.tags.join(", ")}` : ""}). You KNOW this test completely — the user has just seen its AI metric cards and came here to discuss it. ${passport}

All questions with the GROUND-TRUTH correct answers:
${qDump}

ABSOLUTE RULE: the "Correct:" letters above are GROUND TRUTH from the test system — never question them, never suggest a different option is correct.

Answer the user's questions about THIS test: explain any question, discuss the topic, give study advice, analyse the difficulty. Reply in the language the user writes in (Russian, English or Uzbek). Be concise, educational and supportive.

${LATEX_RULE}`;

  const conversationMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const aiResponse = await callAIWithRetry(conversationMessages);
  return { response: normalizeMathNotation(aiResponse) };
}

// ------------------------------------------------------------- smm cards chat --

// The «Обсудить с ИИ» button on the SMM cards (мероприятие / пост /
// специалист): the same tutor contract as tutorChatAboutTest — the server
// loads the card, builds ITS passport into the system prompt and answers
// about THIS card (help the customer prepare / the specialist get ready /
// discuss the terms).
export async function smmCardChat(
  userId: string,
  kind: "event" | "post" | "specialist",
  id: string,
  messages: ChatTurn[]
) {
  let title = "";
  let subject = "";

  if (kind === "event") {
    const ev = await db.smmEvent.findUnique({ where: { id } });
    if (!ev) throw ApiError.notFound("Event not found");
    title = ev.title;
    subject = [
      `Title: ${ev.title}`,
      ev.summary ? `Summary: ${ev.summary.slice(0, 500)}` : "",
      `Format: ${ev.format === "online" ? "online" : "offline"}`,
      ev.format === "online" && ev.platform ? `Platform: ${ev.platform}` : "",
      ev.format === "offline" && ev.location ? `Location: ${ev.location}` : "",
      ev.timeAt ? `Time: ${ev.timeAt}` : "",
      `Qualification tests attached: ${ev.testIds.length}`,
    ]
      .filter(Boolean)
      .join("\n");
  } else if (kind === "post") {
    const post = await db.smmPost.findUnique({
      where: { id },
      include: {
        role: { select: { name: true, pricePerK: true, pricePerDay: true } },
        specialist: { select: { name: true } },
      },
    });
    if (!post) throw ApiError.notFound("Post not found");
    title = post.role?.name || "Post";
    subject = [
      `Specialist: ${post.specialist?.name || "—"}`,
      `Role: ${post.role?.name || "—"}`,
      post.role?.pricePerK != null ? `Price per 1000 views (online): ${post.role.pricePerK}` : "",
      post.role?.pricePerDay != null ? `Price per day 8 hours (offline): ${post.role.pricePerDay}` : "",
      `Media attached: ${(post.media as unknown[] | null)?.length || 0}`,
      post.description ? `Description: ${post.description.slice(0, 800)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } else {
    const user = await db.user.findUnique({
      where: { id },
      select: {
        name: true,
        smmRating: true,
        smmRoles: { select: { name: true, pricePerK: true, pricePerDay: true } },
      },
    });
    if (!user) throw ApiError.notFound("User not found");
    title = user.name;
    const roles = (user.smmRoles || [])
      .map(
        (r) =>
          `- ${r.name}: per 1000 views ${r.pricePerK ?? "—"}, per day (8h) ${r.pricePerDay ?? "—"}`
      )
      .join("\n");
    subject = [
      `Specialist: ${user.name}`,
      `Rating: ${user.smmRating ?? "—"}`,
      roles ? `Roles and prices:\n${roles}` : "No roles yet",
    ].join("\n");
  }

  const systemPrompt = `You are the AI assistant of the SMM marketplace built on the tests site. The user opened the AI discussion about THIS ${kind}: "${title}". You KNOW everything the card shows:

${subject}

Answer the user's questions about THIS ${kind}: explain the details, help the customer prepare or choose, help the specialist get ready, discuss the terms and the platform, give practical SMM advice. Reply in the language the user writes in (Russian, English or Uzbek). Be concise, friendly and practical.

${LATEX_RULE}`;

  const conversationMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.slice(-20).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const aiResponse = await callAIWithRetry(conversationMessages);
  return { response: normalizeMathNotation(aiResponse) };
}

// ------------------------------------------------------------------ explain --

export async function generateExplanations(
  userId: string,
  input: z.infer<typeof explainSchema>
) {
  const { questionIds } = input;
  // Optional UI language: freshly generated explanations are written in this
  // language (stored in translations[lang].explanation for non-English).
  const lang: Lang = isLang(input.lang) ? input.lang : "en";

  // Fetch questions that need explanations
  const questions = await db.question.findMany({
    where: {
      id: { in: questionIds },
      explanation: null,
    },
  });

  if (questions.length === 0) {
    // All questions already have explanations
    const allQuestions = await db.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, explanation: true },
    });
    return { explanations: allQuestions };
  }

  // Build prompt with all questions
  const questionsText = questions
    .map((q, i) => {
      const optionLabels = ["A", "B", "C", "D", "E"];
      const options: string[] = [];
      for (const label of optionLabels) {
        const val = q[`option${label}` as keyof typeof q] as string | null;
        if (val) options.push(`${label}) ${val}`);
      }
      const correctOptionText = q[
        `option${q.correctAnswer}` as keyof typeof q
      ] as string | null;
      return `Q${i + 1}: ${q.text}\nOptions: ${options.join(", ")}\nCorrect: ${q.correctAnswer}) ${correctOptionText || "Unknown"}`;
    })
    .join("\n\n");

  const explanationText = await aiChat({
    messages: [
      {
        role: "system",
        content:
          "You are a concise tutor. For each question, provide a very brief one-line explanation of why the correct answer is right. Keep it to ONE short sentence max. For math: show the key calculation step. For science: state the key fact or formula. Format: Q1: <explanation>, Q2: <explanation>, etc." +
          (lang === "en"
            ? " Use the same language as the question."
            : ` Write EVERY explanation in ${LANG_FULL[lang]} — no exceptions.`) +
          " FORMATTING RULES: write all math/formulas in LaTeX wrapped in single dollar signs like $x^2$, $\\frac{a}{b}$, $A^{-1}$ — the interface renders LaTeX, never use plain-text notation like x^2. NEVER use \\( \\) or \\[ \\] delimiters — only $...$.",
      },
      { role: "user", content: questionsText },
    ],
    temperature: 0.3,
    max_tokens: 2500,
  }).then((r) => r.text);

  // Parse explanations from LLM response
  const explanations: Record<string, string> = {};
  const lines = explanationText.split("\n").filter((l: string) => l.trim());

  for (const line of lines) {
    // Match "Q1: explanation" / "1: explanation" / "1) explanation"
    const match = line.match(/Q?(\d+)[:).]\s*(.+)/);
    if (match) {
      const qIdx = parseInt(match[1]) - 1;
      if (qIdx >= 0 && qIdx < questions.length) {
        explanations[questions[qIdx].id] = match[2].trim();
      }
    }
  }

  // Fallback: if parsing failed, assign line-by-line
  if (Object.keys(explanations).length === 0 && questions.length > 0) {
    for (let i = 0; i < Math.min(lines.length, questions.length); i++) {
      explanations[questions[i].id] = lines[i]
        .replace(/^Q?\d+[:).]\s*/, "")
        .trim();
    }
  }

  // Save generated explanations to DB. English goes to the classic column;
  // other languages additionally land in translations[lang].explanation so
  // the language switcher can pick them up later.
  if (lang === "en") {
    await Promise.all(
      Object.entries(explanations).map(([id, explanation]) =>
        db.question.update({
          where: { id },
          data: { explanation: normalizeMathNotation(explanation) },
        })
      )
    );
  } else {
    await Promise.all(
      Object.entries(explanations).map(async ([id, explanation]) => {
        const norm = normalizeMathNotation(explanation);
        const row = await db.question.findUnique({
          where: { id },
          select: { translations: true },
        });
        const tr = (row?.translations as Record<string, any> | null) || {};
        tr[lang] = { ...(tr[lang] || {}), explanation: norm };
        return db.question.update({
          where: { id },
          data: { translations: tr },
        });
      })
    );
  }

  // Return all explanations (including pre-existing ones)
  const allQuestions = await db.question.findMany({
    where: { id: { in: questionIds } },
    select: { id: true, explanation: true },
  });
  return { explanations: allQuestions };
}
