// SMM APPLICATIONS — заявки (the specialist applies to an event with their role)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { createApplication, listMyApplications } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listMyApplications(userId));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createApplication(userId, "", body), { status: 201 });
});
