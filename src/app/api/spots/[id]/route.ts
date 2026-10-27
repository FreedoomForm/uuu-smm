// PHOTO SPOT [id] — edit / delete (author only).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { updateSpot, deleteSpot } from "@/server/services/spots.service";

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await updateSpot(userId, params.id, body));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deleteSpot(userId, params.id));
});
