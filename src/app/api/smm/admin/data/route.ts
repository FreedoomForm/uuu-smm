// ADMIN DATA — tickets + users for the админ-панель (admins only).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listAdminData } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listAdminData(userId));
});
