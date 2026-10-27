// POST /api/ai/test-chat — the AI chat about the WHOLE TEST (full context).
//
// The conversation behind the «Обсудить с ИИ» button: the server loads the
// test, every question with its ground-truth answers and the passport scores
// into the system prompt, so the tutor "already has the whole context about
// this test". The dashboard window opens straight into this chat.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { aiTestChatSchema } from "@/server/schemas";
import { tutorChatAboutTest } from "@/server/services/ai.service";
import { handleApiError } from "@/server/http/errors";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ userId, req, params }) => {
    try {
      const body = await parseBody(req, aiTestChatSchema);
      const result = await tutorChatAboutTest(userId, params.id, body.messages);
      return NextResponse.json(result);
    } catch (error: any) {
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.message?.includes("Too many requests") ||
        error?.message?.includes("rate");
      if (isRateLimit) {
        return NextResponse.json(
          {
            error: "AI is currently busy. Please wait a moment and try again.",
            rateLimited: true,
          },
          { status: 429 }
        );
      }
      const { status, body } = handleApiError(error);
      return NextResponse.json(body, { status });
    }
  },
  { rateLimit: "ai" }
);
