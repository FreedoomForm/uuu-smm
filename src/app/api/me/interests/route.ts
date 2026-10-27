// /api/me/interests — onboarding interests (seeds the For You feed).
// GET → { interests, suggestions }   PUT { interests } → saved
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { interestsSchema } from "@/server/schemas";
import {
  getInterests,
  saveInterests,
} from "@/server/services/me.service";

export const dynamic = "force-dynamic";

export const GET = withApiAuth(async ({ userId }) => {
  const result = await getInterests(userId);
  return NextResponse.json(result);
});

export const PUT = withApiAuth(async ({ userId, req }) => {
  const body = await parseBody(req, interestsSchema);
  const result = await saveInterests(userId, body.interests);
  return NextResponse.json(result);
});
