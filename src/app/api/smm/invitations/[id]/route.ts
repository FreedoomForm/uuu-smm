// SMM INVITATION [id] — withdraw a pending приглашение
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { withdrawInvitation } from "@/server/services/smm2.service";

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await withdrawInvitation(userId, params.id));
});
