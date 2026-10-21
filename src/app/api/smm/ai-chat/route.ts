// POST /api/smm/ai-chat — the AI chat about an SMM CARD (the «Обсудить с ИИ»
// button on the мероприятие / пост / специалист cards). The same contract as
// the test ai-chat: the server loads the card, builds its passport into the
// system prompt and keeps the whole context server-side.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmAiChatSchema } from "@/server/schemas";
import { smmCardChat } from "@/server/services/ai.service";
import { handleApiError } from "@/server/http/errors";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ userId, req }) => {
    try {
      const body = await parseBody(req, smmAiChatSchema);
      const result = await smmCardChat(userId, body.kind, body.id, body.messages);
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
