// «Личные роли» — every role (ТЗ) of the signed-in customer's OWN events.
// GET — the flat review feed (role cards with event context, assigned
// specialists, live counters and the shared-template link).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listMyRoles } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listMyRoles(userId));
});
