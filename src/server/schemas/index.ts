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
  // SMM account kind — «Заказчик» | «SMM-специалист» picker at signup
  smmRole: z.enum(["customer", "specialist"]).optional(),
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

// The event's share — the exact analogue of shareTestSchema.
export const smmEventShareSchema = z.object({
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
  // SMM account kind — switchable in the profile page
  smmRole: z.enum(["customer", "specialist"]).optional(),
});

export const interestsSchema = z.object({
  interests: z.unknown().optional(), // cleaned by sanitizeInterests in the service
});

// ------------------------------------------------------------------- smm ----
// Registration accepts the account kind (заказчик | SMM-специалист);
// it defaults to "customer" server-side when omitted.
export const smmProfileSchema = z.object({
  smmRole: z.enum(["customer", "specialist"]).optional(),
  smmHeadline: z.string().max(120).optional(),
  smmResume: z.string().max(8000).optional(),
  // Presentation video — tg:/data:/https: reference, same rules as media everywhere
  smmVideoUrl: z.string().max(11_000_000).nullish(),
  smmCity: z.string().max(60).optional(),
  smmRate: z.string().max(120).optional(),
  smmReady: z.boolean().optional(),
});

export const smmRoleInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brief: z.string().max(8000).optional(),
  payment: z.string().max(120).optional(),
  deadline: z.string().max(120).optional(),
});

export const smmEventCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(1000).optional(),
  brief: z.string().max(20000).optional(),
  deadline: z.string().max(120).optional(),
  budget: z.string().max(120).optional(),
  restrictions: z.string().max(2000).optional(),
  kind: z.enum(["business", "government"]).optional(),
  coverColor: z.string().max(40).nullish(),
  coverIcon: z.string().max(40).nullish(),
  isPublic: z.boolean().optional(),
  roles: z.array(smmRoleInputSchema).max(50).optional(),
});

export const smmEventUpdateSchema = smmEventCreateSchema.partial().extend({
  status: z.enum(["open", "closed"]).optional(),
});

export const smmRoleUpdateSchema = smmRoleInputSchema.partial().extend({
  isPublic: z.boolean().optional(),
});

export const smmInvitationCreateSchema = z.object({
  eventId: z.string().min(1).max(64),
  roleId: z.string().min(1).max(64),
  specialistId: z.string().min(1).max(64),
  // Уникальное ТЗ из «Дополнительных настроек» — overrides the role template
  message: z.string().max(8000).optional(),
});

export const smmApplicationCreateSchema = z.object({
  eventId: z.string().min(1).max(64),
  roleId: z.string().min(1).max(64),
  // Уникальный текст заявки из «Дополнительных настроек»
  message: z.string().max(8000).optional(),
  // The structured запрос the specialist sends with this application
  requestId: z.string().min(1).max(64).optional(),
});

export const smmRespondSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export const smmBookmarkSchema = z.object({
  targetType: z.enum(["specialist", "event", "request", "role"]),
  targetId: z.string().min(1).max(64),
});

// ── ЗАПРОСЫ — the specialist's structured proposals ──────────────────────
export const smmRequestStepInputSchema = z.object({
  title: z.string().max(200).optional(),
  hint: z.string().max(2000).optional(),
  answer: z.string().max(20000).optional(),
});

export const smmRequestCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(1000).optional(),
  coverColor: z.string().max(40).nullish(),
  coverIcon: z.string().max(40).nullish(),
  isPublic: z.boolean().optional(),
  steps: z.array(smmRequestStepInputSchema).max(60).optional(),
});

export const smmRequestUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().max(1000).optional(),
  coverColor: z.string().max(40).nullish(),
  coverIcon: z.string().max(40).nullish(),
  isPublic: z.boolean().optional(),
  steps: z.array(smmRequestStepInputSchema).max(60).optional(),
});

export const smmRequestShareSchema = z.object({
  scope: z.enum(["link", "community"]).optional().catch("link" as const),
});

// Standalone public role template («Общие роли») + attaching one to my event
export const smmRoleTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brief: z.string().max(8000).optional(),
  payment: z.string().max(120).optional(),
  deadline: z.string().max(120).optional(),
  isPublic: z.boolean().optional(),
});

export const smmRoleAttachSchema = z.object({
  eventId: z.string().min(1).max(64),
});

export const smmFileCreateSchema = z.object({
  ownerType: z.enum(["user", "event"]),
  ownerId: z.string().min(1).max(64),
  title: z.string().max(200).optional(),
  type: z.string().max(20).optional(),
  url: z.string().max(11_000_000),
  size: z.number().int().nullish(),
  tgMessageId: z.number().int().nullish(),
});

export const smmChatSendSchema = z.object({
  scopeType: z.enum(["event", "specialist"]),
  scopeId: z.string().min(1).max(64),
  text: z.string().min(1).max(2000),
});

export const smmAiChatSchema = z.object({
  specialistId: z.string().min(1).max(64).optional(),
  eventId: z.string().min(1).max(64).optional(),
  requestId: z.string().min(1).max(64).optional(),
  roleId: z.string().min(1).max(64).optional(),
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
