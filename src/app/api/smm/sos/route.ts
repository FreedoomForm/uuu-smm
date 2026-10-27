// СОС — the platform-support signal (any deal party) → the админ-панель.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { createSosTicket } from "@/server/services/smm2.service";

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await createSosTicket(userId, body || {}), { status: 201 });
});
