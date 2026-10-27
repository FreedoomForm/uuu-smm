// GET /api/ai/status — deployment diagnostics for the AI provider chain
// (Gemini / Google AI Mode / Mistral). No secrets are returned.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { aiStatus } from "@/lib/ai";

export const GET = withApi(async () => {
  return NextResponse.json(aiStatus());
});
