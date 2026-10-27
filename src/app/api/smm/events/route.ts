// SMM EVENTS — the customer's мероприятия (the 4 facts + qualification tests)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listEvents, createEvent } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  return NextResponse.json(await listEvents(userId, searchParams.get("scope") || "public"));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createEvent(userId, body), { status: 201 });
});
