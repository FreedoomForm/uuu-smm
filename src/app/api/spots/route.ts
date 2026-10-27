// PHOTO SPOTS — the public map pins (столп 3: красивые места + советы съёмки).
// GET  ?scope=public → every visitor (SEO traffic); ?scope=mine → own spots.
// POST → create a spot (signed-in).
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { listSpots, createSpot } from "@/server/services/spots.service";

export const GET = withApi(async ({ userId, searchParams }) => {
  return NextResponse.json(await listSpots(searchParams.get("scope") || "public", userId ?? undefined));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createSpot(userId, body), { status: 201 });
});
