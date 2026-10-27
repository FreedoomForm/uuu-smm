// POST /api/tests/[id]/version-name { versionName } — the naming dialog's
// endpoint: the author gives the test its version name (the first save / the
// first share-by-link). Creator-only; touches ONLY the versionName column.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { versionNameSchema } from "@/server/schemas";
import { setTestVersionName } from "@/server/services/tests.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, versionNameSchema);
    const result = await setTestVersionName(userId, params.id, body);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
