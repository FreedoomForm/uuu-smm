// POST /api/smm/requests/[id]/share { scope: 'link' | 'community' } — the
// запрос's analogue of the events' share endpoint: "link" copies through,
// "community" flips isPublic (owner-only) so the запрос joins or leaves the
// public templates library («Публичная библиотека»).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRequestShareSchema } from "@/server/schemas";
import { shareRequest } from "@/server/services/smm.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmRequestShareSchema);
    const result = await shareRequest(userId, params.id, body);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
