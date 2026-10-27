// POST /api/chat — the AI tutor dialogue for one question (Gemini →
// Google AI Mode → Mistral provider chain; retry on provider rate limits).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { aiChatSchema } from "@/server/schemas";
import { tutorChat } from "@/server/services/ai.service";
import { handleApiError } from "@/server/http/errors";

export const POST = withApiAuth(
  async ({ userId, req }) => {
    try {
      const body = await parseBody(req, aiChatSchema);
      const result = await tutorChat(userId, body);
      return NextResponse.json(result);
    } catch (error: any) {
      // Provider-level rate limits surface as 429 with the flag the client
      // already understands (chat UI switches to a "busy" message)
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
