// СОС TICKET [id] — the admin accepts (enters the chat) or closes it.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { adminTicketAction } from "@/server/services/smm2.service";

export const PATCH = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await adminTicketAction(userId, params.id, String(body?.action || "")));
});
