// SMM ROLES — the specialist's own roles (name + the two prices)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listMyRoles } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listMyRoles(userId));
});
