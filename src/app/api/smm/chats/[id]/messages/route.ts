// SMM CHAT MESSAGES — polled (GET ?after=) / send (POST)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listChatMessages, sendChatMessage } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, params, searchParams }) => {
  return NextResponse.json(await listChatMessages(userId, params.id, searchParams.get("after") || undefined));
});

export const POST = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await sendChatMessage(userId, params.id, String(body.text || "")), { status: 201 });
});
