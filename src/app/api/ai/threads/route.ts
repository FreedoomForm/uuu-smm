// /api/ai/threads — the signed-in user's AI-tutor conversations (many per
// test — «Новый чат» spawns fresh threads), stored in the DATABASE.
// Previously `ai_threads_<uid>` localStorage.
// GET → { threads: [{ id, testId, title, messages, updatedAt }] }
// PUT → upsert one thread { id?, testId, title, messages } → { ok, id }
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { z } from "zod";
import { listThreads, saveThread } from "@/server/services/ai-threads.service";

export const runtime = "nodejs";

// id — the client's thread key (crypto.randomUUID() or a cuid-shaped
// fallback): 6..64 chars of url-safe alphabet.
const threadSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional(),
  testId: z.string().min(1).max(64),
  title: z.string().max(200).optional().default(""),
  messages: z.array(z.unknown()).max(200),
});

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listThreads(userId));
});

export const PUT = withApiAuth(async ({ userId, req }) => {
  const body = await parseBody(req, threadSchema);
  return NextResponse.json(await saveThread(userId, body));
});
