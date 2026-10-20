// POST /api/smm/shared-roles/[id]/use — copy a shared ТЗ template into one
// of MY events as a new role (the «Общие роли» card's «В моё мероприятие»).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmSharedRoleUseSchema } from "@/server/schemas";
import { useSharedRole } from "@/server/services/smm.service";

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmSharedRoleUseSchema);
    return NextResponse.json(await useSharedRole(params.id, userId, body.eventId), { status: 201 });
  },
  { rateLimit: "testWrite" }
);
