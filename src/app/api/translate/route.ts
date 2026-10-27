// POST /api/translate — free MT relay for on-the-fly question translation.
// Public (anonymous test viewers translate too), rate-limited per IP.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { translateSchema } from "@/server/schemas";
import { translateTexts } from "@/server/services/translate.service";

export const POST = withApi(
  async ({ req }) => {
    const body = await parseBody(req, translateSchema);
    const result = await translateTexts(body, body.texts);
    return NextResponse.json(result);
  },
  { rateLimit: "translate" }
);
