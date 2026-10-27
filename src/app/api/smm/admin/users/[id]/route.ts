// ADMIN USER [id] — block / unblock (login + every authed call refuse after).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { adminSetUserBlocked } from "@/server/services/smm2.service";

export const PATCH = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await adminSetUserBlocked(userId, params.id, !!body?.blocked));
});
