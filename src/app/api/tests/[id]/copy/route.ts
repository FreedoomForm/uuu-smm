// POST /api/tests/[id]/copy — "Edit" on somebody else's test: makes a private
// COPY in the requester's library with a unique name and returns it.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { copyTest } from "@/server/services/tests.service";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ userId, params }) => {
    const copy = await copyTest(userId, params.id);
    return NextResponse.json(copy);
  },
  { rateLimit: "testWrite" }
);
