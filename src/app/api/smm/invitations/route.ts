// SMM INVITATIONS — приглашения (the customer invites a specialist)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { createInvitation, listMyInvitations } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listMyInvitations(userId));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createInvitation(userId, "", body), { status: 201 });
});
