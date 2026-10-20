// GET  /api/smm/roles?box=mine|public — the «Общие роли» library:
//        mine   → my event roles + my standalone templates (the personal
//                 roles overview: every ТЗ I own across my events)
//        public → every isPublic template — people share task templates
// POST /api/smm/roles — create a standalone role template (isPublic default)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRoleTemplateCreateSchema } from "@/server/schemas";
import { createRoleTemplate, listRoles } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  const box = searchParams.get("box") === "public" ? "public" : "mine";
  return NextResponse.json(await listRoles(userId, box));
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, smmRoleTemplateCreateSchema);
    return NextResponse.json(await createRoleTemplate(userId, body));
  },
  { rateLimit: "testWrite" }
);
