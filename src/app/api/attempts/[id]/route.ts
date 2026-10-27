// GET  /api/attempts/[id] — one attempt (OWNER-ONLY).
// PUT  /api/attempts/[id] — save answers / complete the attempt (owner-only).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { updateAttemptSchema } from "@/server/schemas";
import {
  getAttempt,
  updateAttempt,
} from "@/server/services/attempts.service";

export const GET = withApiAuth(async ({ userId, params }) => {
  const attempt = await getAttempt(params.id, userId);
  return NextResponse.json(attempt);
});

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await parseBody(req, updateAttemptSchema);
  const updated = await updateAttempt(params.id, userId, body);
  return NextResponse.json(updated);
});
