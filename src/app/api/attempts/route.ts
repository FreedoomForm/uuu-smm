import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { createAttemptSchema } from "@/server/schemas";
import {
  createAttempt,
  listAttempts,
} from "@/server/services/attempts.service";

// GET /api/attempts — the caller's attempts.
export const GET = withApiAuth(async ({ userId }) => {
  const attempts = await listAttempts(userId);
  return NextResponse.json(attempts);
});

// POST /api/attempts — start an attempt (recommendation signal inside).
export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, createAttemptSchema);
    const attempt = await createAttempt(userId, body);
    return NextResponse.json(attempt, { status: 201 });
  },
  { rateLimit: "testWrite" }
);
