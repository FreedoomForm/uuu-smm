// POST /api/tests/[id]/share { scope: 'link' | 'community' } — publish /
// unpublish the caller's own test (publishing rules in the service).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { shareTestSchema } from "@/server/schemas";
import { shareTest } from "@/server/services/tests.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, shareTestSchema);
    const result = await shareTest(userId, params.id, body);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
