// POST /api/smm/ai-chat — the «ИИ чат»: a SPECIALIST is discussed by the
// CUSTOMER (prompt from the анкета: headline, resume, city/rate, files), an
// EVENT is discussed by anyone (prompt from its brief, roles, money) — the
// same provider chain as the rest of the app.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmAiChatSchema } from "@/server/schemas";
import { chatAboutEvent, chatAboutRequest, chatAboutRole, chatAboutSpecialist } from "@/server/services/smm.service";

export const POST = withApiAuth(
  async ({ req }) => {
    const body = await parseBody(req, smmAiChatSchema);
    // The «ИИ чат» card button works for BOTH entities: a specialist's анкета
    // (the customer's research window) and an EVENT (its brief, roles, money).
    try {
      if (body.eventId) {
        return NextResponse.json(await chatAboutEvent(body.eventId, body.messages));
      }
      if (body.requestId) {
        return NextResponse.json(await chatAboutRequest(body.requestId, body.messages));
      }
      if (body.roleId) {
        return NextResponse.json(await chatAboutRole(body.roleId, body.messages));
      }
      return NextResponse.json(await chatAboutSpecialist(body.specialistId!, body.messages));
    } catch (error: any) {
      // Provider-level rate limits surface as 429 with the flag the client
      // already understands (the chat UI switches to a "busy" message);
      // a not-configured provider degrades to a calm 503 — the card stays
      // usable, the AI window explains itself instead of a raw 500.
      const msg = String(error?.message || "");
      const isRateLimit = msg.includes("429") || msg.includes("Too many requests") || msg.includes("rate");
      if (isRateLimit) {
        return NextResponse.json({ error: "AI is currently busy. Please wait a moment and try again.", rateLimited: true }, { status: 429 });
      }
      if (msg.includes("NOT_CONFIGURED")) {
        return NextResponse.json({ error: "AI is not configured yet (ZAI_API_KEY is missing on this deployment)." }, { status: 503 });
      }
      return NextResponse.json({ error: msg || "AI request failed" }, { status: 502 });
    }
  },
  { rateLimit: "ai" }
);
