// Per-test group chat (user ↔ user).
// GET  ?after=<ISO> — poll messages (public, read-only)
// POST             — send a message (any signed-in user)
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { sendGroupMessageSchema } from "@/server/schemas";
import {
  getGroupMessages,
  sendGroupMessage,
} from "@/server/services/chat.service";

export const GET = withApi(async ({ params, searchParams }) => {
  const messages = await getGroupMessages(params.id, searchParams.get("after") || undefined);
  return NextResponse.json(messages);
});

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, sendGroupMessageSchema);
    const message = await sendGroupMessage(params.id, userId, body.text);
    return NextResponse.json(message, { status: 201 });
  },
  { rateLimit: "chatSend" }
);
