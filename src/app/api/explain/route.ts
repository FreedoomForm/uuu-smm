// POST /api/explain — generate (or fetch) one-line explanations for a batch
// of questions; stored on the Question rows for everyone.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { explainSchema } from "@/server/schemas";
import { generateExplanations } from "@/server/services/ai.service";

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, explainSchema);
    const result = await generateExplanations(userId, body);
    return NextResponse.json(result);
  },
  { rateLimit: "ai" }
);
