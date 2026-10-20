// «Общие роли» — the community library of shared role (ТЗ) templates.
// GET  — list (authed; isOwn marks the viewer's own templates)
// POST — publish: { sourceRoleId } from MY event role (upsert, one template
//        per source role) or standalone { name, brief?, payment?, deadline? }
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmSharedRoleCreateSchema } from "@/server/schemas";
import { createSharedRole, listSharedRoles } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listSharedRoles(userId));
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, smmSharedRoleCreateSchema);
    return NextResponse.json(await createSharedRole(userId, body), { status: 201 });
  },
  { rateLimit: "testWrite" }
);
