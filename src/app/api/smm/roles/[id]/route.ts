// SMM ROLE [id] — delete (owner only)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { deleteRole } from "@/server/services/smm2.service";

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deleteRole(userId, params.id));
});
