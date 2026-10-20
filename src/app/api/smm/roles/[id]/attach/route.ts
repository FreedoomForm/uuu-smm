// POST /api/smm/roles/[id]/attach { eventId } — take a public role template
// («Общие роли») into one of MY events: the template text is copied into a
// fresh role of the event; the shared template itself stays public.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRoleAttachSchema } from "@/server/schemas";
import { attachRoleTemplate } from "@/server/services/smm.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmRoleAttachSchema);
    return NextResponse.json(await attachRoleTemplate(params.id, userId, body));
  },
  { rateLimit: "testWrite" }
);
