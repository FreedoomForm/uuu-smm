// ---------------------------------------------------------------------------
// zod request schemas — every API input is validated here before any service
// runs. This is the dubinc/dub pattern (lib/zod/schemas/*): the schema is the
// single source of truth for what a request may look like.
//
// Design rule: schemas enforce STRUCTURE and BOUNDS, and preserve the
// historical lenient behaviour where the product relied on it (unknown tag
// payloads go through sanitizeTags, wrong tab/scope values fall back to
// defaults instead of failing the feed, etc.).
// ---------------------------------------------------------------------------

import { z } from "zod";

// ------------------------------------------------------------------- auth ---
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(200)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email"),
  name: z.string().trim().min(1).max(60),
  password: z.string().min(6).max(100),
  // Account kind chosen at registration: the SMM tab the user will see.
  // SEPARATE REGISTRATION — «СММ специалист» vs «Заказчик» pick their flow;
  // the choice is FIXED (no bottom-panel role switcher afterwards).
  smmRole: z.enum(["specialist", "customer"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1).max(200),
  password: z.string().min(1).max(100),
});

// ------------------------------------------------------------------- feed ---
export const feedQuerySchema = z.object({
  tab: z
    .enum(["foryou", "trending", "new"])
    .default("foryou")
    .catch("foryou" as const),
  scope: z
    .enum(["all", "mine", "discover"])
    .default("all")
    .catch("all" as const),
  limit: z.coerce
    .number()
    .int()
    .min(2)
    .max(20)
    .default(10)
    .catch(10),
  tag: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().slice(0, 30) || null)
    .catch(null),
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().slice(0, 80) || null)
    .catch(null),
  creatorId: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim() || null)
    .catch(null),
  cursor: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim() || null)
    .catch(null),
});

export const feedSignalSchema = z.object({
  testId: z.string().min(1).max(64),
  kind: z.enum(["view", "skip"]),
  ms: z.number().int().min(0).max(600_000).optional(),
});

// ------------------------------------------------------------------ tests ---
export const questionInputSchema = z.object({
  text: z.string(),
  optionA: z.string(),
  optionB: z.string(),
  optionC: z.string(),
  optionD: z.string(),
  optionE: z.string().nullish(),
  correctAnswer: z
    .string()
    .optional()
    .transform((v) => (/^[A-E]$/.test(v ?? "") ? (v as string) : "A"))
    .catch("A"),
  explanation: z.string().nullish(),
  translations: z.unknown().optional(),
  imageNumber: z.number().int().nullish(),
  imageUrl: z.unknown().optional(), // tg:/data:/https: reference, validated in service
  imageMsgId: z.number().int().nullish(),
  optionImages: z.unknown().nullish(),
});

export const attachmentInputSchema = z.object({
  title: z.string().max(200).optional(),
  type: z.string().max(20).optional(),
  url: z.string().max(11_000_000),
  size: z.number().int().nullish(),
  tgMessageId: z.number().int().nullish(),
  orderNum: z.number().int().optional(),
});

export const createTestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).optional(),
  topic: z.string().max(60).optional(),
  isPublic: z.boolean().optional(),
  randomizeQuestions: z.boolean().optional(),
  randomizeOptions: z.boolean().optional(),
  questions: z.array(questionInputSchema).max(1000).optional(),
  attachments: z.array(attachmentInputSchema).max(100).optional(),
  tags: z.unknown().optional(), // cleaned by sanitizeTags in the service
  coverIcon: z.unknown().optional(),
  coverColor: z.unknown().optional(),
});

export const updateTestSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  topic: z.string().max(60).optional(),
  isPublic: z.boolean().optional(),
  randomizeQuestions: z.boolean().optional(),
  randomizeOptions: z.boolean().optional(),
  questions: z.array(questionInputSchema).max(1000).optional(),
  attachments: z.array(attachmentInputSchema).max(100).optional(),
  tags: z.unknown().optional(),
  coverIcon: z.unknown().optional(),
  coverColor: z.unknown().optional(),
  // The version's own name from the naming dialog (first save / first share)
  versionName: z.string().trim().min(1).max(200).optional(),
});

// The naming dialog's dedicated endpoint: names a test's version in one
// lightweight round trip (no questions payload, no version gates).
export const versionNameSchema = z.object({
  versionName: z.string().trim().min(1).max(200),
});

export const shareTestSchema = z.object({
  scope: z.enum(["link", "community"]).optional().catch("link" as const),
});

export const saveTranslationsSchema = z.object({
  lang: z.enum(["en", "ru", "uz"]),
  items: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        text: z.string().max(8000).optional(),
        options: z.record(z.string(), z.string()).optional(),
        explanation: z.string().max(8000).optional(),
      })
    )
    .min(1)
    .max(500),
});

// -------------------------------------------------------------- bookmarks ---
export const bookmarkSchema = z.object({
  testId: z.string().min(1).max(64),
});

// --------------------------------------------------------------- attempts ---
export const createAttemptSchema = z.object({
  testId: z.string().min(1).max(64),
  totalQuestions: z.number().int().positive().max(1000).optional(),
});

export const updateAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(64),
        selectedAnswer: z.string().min(1).max(10),
        isCorrect: z.boolean().optional(), // ignored — graded server-side
      })
    )
    .max(1000)
    .optional(),
  completed: z.boolean().optional(),
});

// -------------------------------------------------------- group chat (test) ---
export const sendGroupMessageSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const groupChatQuerySchema = z.object({
  after: z.string().max(64).optional(),
});

// -------------------------------------------------------------- AI tutor ---
export const aiChatSchema = z.object({
  questionId: z.string().min(1).max(64),
  userAnswer: z.string().max(10).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .max(60)
    .optional()
    .default([]),
  questionContext: z
    .object({
      text: z.string().max(8000),
      options: z.record(z.string(), z.string()),
      correctAnswer: z.string().max(5),
      topic: z.string().max(100),
    })
    .optional(),
});

export const explainSchema = z.object({
  questionIds: z.array(z.string().min(1).max(64)).min(1).max(200),
  lang: z.string().max(5).optional(),
});

// AI chat about the WHOLE TEST (opened with the «Обсудить с ИИ» button /
// after the metrics passport): no concrete question — the AI holds the full
// test context server-side (title, topic, tags, questions with answers).
export const aiTestChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .min(1)
    .max(60),
});

// AI chat about an SMM CARD (the «Обсудить с ИИ» button on the мероприятие /
// пост / специалист cards): the server builds the card's passport into the
// system prompt, no concrete question — the AI holds the full card context.
export const smmAiChatSchema = z.object({
  kind: z.enum(["event", "post", "specialist"]),
  id: z.string().min(1).max(64),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    )
    .min(1)
    .max(60),
});

// -------------------------------------------------------------- translate ---
export const translateSchema = z.object({
  texts: z.array(z.string().max(6000)).min(1).max(500),
  to: z.enum(["en", "ru", "uz"]),
});

// -------------------------------------------------------------------- me ----
export const profileUpdateSchema = z.object({
  name: z.string().max(120).optional(),
  bgStyle: z.string().max(120).optional(),
  lang: z.enum(["en", "ru", "uz"]).optional(),
  // The SMM mode switcher (the second bottom panel): persisted per account
  smmRole: z.enum(["specialist", "customer"]).optional(),
  // ── COMPANY PROFILE (customer side of the tourism marketplace) ──
  smmCompanyName: z.string().max(120).optional(),
  smmCompanyType: z.enum(["", "hotel", "guesthouse", "guide", "tour-agency", "other"]).optional(),
  smmCompanyCity: z.string().max(80).optional(),
  // Premium profile badge (monetization MVP — billing comes later)
  smmPremium: z.boolean().optional(),
});

export const interestsSchema = z.object({
  interests: z.unknown().optional(), // cleaned by sanitizeInterests in the service
});
