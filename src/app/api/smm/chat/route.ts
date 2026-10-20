// SMM group chat (about an EVENT or a SPECIALIST) — the same polled pattern
// as the per-test chat.
// GET  ?scopeType=event|specialist|shared-role&scopeId=…&after=<ISO> — public read
// POST — send a message (any signed-in user)
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmChatSendSchema } from "@/server/schemas";
import { getSmmMessages, sendSmmMessage } from "@/server/services/smm.service";

export const GET = withApi(async ({ searchParams }) => {
  const rawScope = searchParams.get("scopeType") || "";
  const scopeType = (rawScope === "event" || rawScope === "shared-role") ? rawScope : "specialist";
  const scopeId = (searchParams.get("scopeId") || "").slice(0, 64);
  if (!scopeId) return NextResponse.json([]);
  const after = searchParams.get("after") || undefined;
  return NextResponse.json(await getSmmMessages(scopeType, scopeId, after));
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, smmChatSendSchema);
    return NextResponse.json(await sendSmmMessage(body.scopeType, body.scopeId, userId, body.text), { status: 201 });
  },
  { rateLimit: "chatSend" }
);
