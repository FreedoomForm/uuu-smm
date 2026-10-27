import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { updateTestSchema } from "@/server/schemas";
import {
  deleteTest,
  getTest,
  updateTest,
} from "@/server/services/tests.service";

// GET /api/tests/[id] — the full test (public read; shared-link viewing).
export const GET = withApi(async ({ params }) => {
  const test = await getTest(params.id);
  return NextResponse.json(test);
});

// PUT /api/tests/[id] — creator-only full save (editor payload).
export const PUT = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, updateTestSchema);
    const updated = await updateTest(userId, params.id, body);
    return NextResponse.json(updated);
  },
  { rateLimit: "testWrite" }
);

// DELETE /api/tests/[id] — creator-only delete (+ Telegram channel cleanup).
export const DELETE = withApiAuth(
  async ({ userId, params }) => {
    const result = await deleteTest(userId, params.id);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
