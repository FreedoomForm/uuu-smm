// DEAL REQUEST TO THE ADMIN — a deal party presses «Успешно закончить сделку»
// or «Отменить сделку» in the chat; the action lands as a ticket in the
// admins' ПУБЛИЧНАЯ библиотека and only the admin's confirm applies it.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { requestDealAction } from "@/server/services/smm2.service";

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await requestDealAction(userId, body || {}), { status: 201 });
});
