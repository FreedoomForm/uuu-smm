// SMM CARD CHAT — everyone's chat about ONE card («Чат» button), the same
// per-card group chat the test cards keep. scopeType: event|post|specialist.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listCardChat, sendCardChat } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, req }) => {
  const sp = req.nextUrl.searchParams;
  return NextResponse.json(await listCardChat(userId, String(sp.get("scopeType") || ""), String(sp.get("scopeId") || "")));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(
    await sendCardChat(userId, String(body.scopeType || ""), String(body.scopeId || ""), String(body.text || "")),
    { status: 201 },
  );
});
