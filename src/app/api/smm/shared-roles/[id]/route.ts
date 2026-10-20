// One shared role template («Общие роли»).
// GET    — the single card (deep links ?role=<id>)
// PUT    — edit (author only)
// DELETE — unpublish (author only)
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmSharedRoleUpdateSchema } from "@/server/schemas";
import { deleteSharedRole, getSharedRole, updateSharedRole } from "@/server/services/smm.service";

export const GET = withApi(async ({ userId, params }) => {
  return NextResponse.json(await getSharedRole(params.id, userId || undefined));
});

export const PUT = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmSharedRoleUpdateSchema);
    return NextResponse.json(await updateSharedRole(params.id, userId, body));
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(
  async ({ userId, params }) => {
    return NextResponse.json(await deleteSharedRole(params.id, userId));
  },
  { rateLimit: "testWrite" }
);
