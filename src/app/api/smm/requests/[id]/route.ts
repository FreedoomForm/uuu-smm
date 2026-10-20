// GET    /api/smm/requests/[id] — one запрос (own always; foreign only when
//                               public — the link/library rule)
// PUT    /api/smm/requests/[id] — owner-only update (meta + steps wholesale;
//                                the FILLING page submits steps' answers here)
// DELETE /api/smm/requests/[id] — owner-only delete
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRequestUpdateSchema } from "@/server/schemas";
import { deleteRequest, getRequest, updateRequest } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await getRequest(params.id, userId));
});

export const PUT = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmRequestUpdateSchema);
    return NextResponse.json(await updateRequest(params.id, userId, body));
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(
  async ({ userId, params }) => {
    return NextResponse.json(await deleteRequest(params.id, userId));
  },
  { rateLimit: "testWrite" }
);
