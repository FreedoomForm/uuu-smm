import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { createTestSchema } from "@/server/schemas";
import { createTest, listTests } from "@/server/services/tests.service";

// GET /api/tests — every test visible to the caller (own + public),
// or ?creatorId=… for one author's library (public tests only, unless it
// is the caller themself).
export const GET = withApi(async ({ userId, searchParams }) => {
  const creatorId = searchParams.get("creatorId");
  const tests = await listTests(userId, creatorId);
  return NextResponse.json(tests);
});

// POST /api/tests — create a test (authenticated; publishing rules enforced
// in the service).
export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, createTestSchema);
    const { body: created, status } = await createTest(userId, body);
    return NextResponse.json(created, { status });
  },
  { rateLimit: "testWrite" }
);
