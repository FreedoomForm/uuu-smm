// SMM EVENT [id] — read / edit / delete (owner-only writes)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { getEvent, updateEvent, deleteEvent } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ params }) => {
  return NextResponse.json(await getEvent(params.id));
});

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await updateEvent(userId, params.id, body));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deleteEvent(userId, params.id));
});
