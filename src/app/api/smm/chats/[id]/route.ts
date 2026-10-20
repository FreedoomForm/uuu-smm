// SMM CHAT [id] — rename (owner) / delete (owner)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { renameChat, deleteChat } from "@/server/services/smm2.service";

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await renameChat(userId, params.id, String(body.title || "")));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deleteChat(userId, params.id));
});
