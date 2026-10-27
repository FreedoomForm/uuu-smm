// SMM INVITATION [id] — withdraw a pending приглашение · PATCH: the invited
// specialist accepts/declines it (Mercur deal lifecycle: accept = deal starts)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { withdrawInvitation, decideInvitation } from "@/server/services/smm2.service";

export const PATCH = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await decideInvitation(userId, params.id, String(body?.decision || "")));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await withdrawInvitation(userId, params.id));
});
