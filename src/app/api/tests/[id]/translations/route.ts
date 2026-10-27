// POST /api/tests/[id]/translations — persist machine translations produced
// on the client into Question.translations (merged per language).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { saveTranslationsSchema } from "@/server/schemas";
import { saveTranslations } from "@/server/services/tests.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, saveTranslationsSchema);
    const result = await saveTranslations(userId, params.id, body);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
