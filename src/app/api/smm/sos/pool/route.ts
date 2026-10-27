// THE ADMIN'S TICKET LIBRARIES — the marketplace docks for admins:
// pool = every OPEN СОС-запрос (the ПУБЛИЧНАЯ библиотека all admins share),
// mine = the tickets THIS admin accepted (the ЛИЧНАЯ библиотека).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listTicketPool } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listTicketPool(userId));
});
