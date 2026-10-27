// /api/me — the signed-in user's own profile.
// GET    → profile fields (name, email, background preset key)
// PUT    → update name / background
// DELETE → permanently delete the account (+ Telegram-hosted files)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { profileUpdateSchema } from "@/server/schemas";
import {
  deleteAccount,
  getProfile,
  updateProfile,
} from "@/server/services/me.service";

export const runtime = "nodejs";

export const GET = withApiAuth(async ({ userId }) => {
  const user = await getProfile(userId);
  return NextResponse.json(user);
});

export const PUT = withApiAuth(async ({ userId, req }) => {
  const body = await parseBody(req, profileUpdateSchema);
  const user = await updateProfile(userId, body);
  return NextResponse.json(user);
});

export const DELETE = withApiAuth(async ({ userId }) => {
  const result = await deleteAccount(userId);
  return NextResponse.json(result);
});
