// SMM CHATS — the чат window (group chats + direct dialogs)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listChats, createChat } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listChats(userId));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createChat(userId, String(body.title || ""), body.peerId ? String(body.peerId) : undefined), { status: 201 });
});
