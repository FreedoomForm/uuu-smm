// POST /api/smm/agent — the platform AUTOMATION agent (the one-button
// replacement of the free tools page). Executes a task:
//   content-plan | reels-ideas | hashtags  → ready text the user copies
//   event-tz                               → STRICT JSON ТЗ; the client turns
//                                            it into a real мероприятие.
// Authed + the same "ai" rate limit as the tutor (every call costs quota).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { isLang } from "@/lib/i18n";
import { smmAgent } from "@/server/services/agent.service";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ req }) => {
    const body = await req.json().catch(() => ({}));
    const lang = isLang(body.lang) ? body.lang : "ru";
    const result = await smmAgent(
      typeof body.task === "string" ? body.task : "content-plan",
      typeof body.business === "string" ? body.business : "",
      typeof body.platform === "string" ? body.platform : "",
      typeof body.details === "string" ? body.details : "",
      lang
    );
    return NextResponse.json(result);
  },
  { rateLimit: "ai" }
);
