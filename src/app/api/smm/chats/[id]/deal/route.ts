// CHAT DEAL STATE — the live invitations / active deal / pending admin
// request of a direct chat. The chat page fetches this after every action so
// the buttons re-render instantly (the poll response carries the same meta).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { getChatMeta } from "@/server/services/smm2.service";

export const dynamic = "force-dynamic";

export const GET = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await getChatMeta(userId, params.id));
});
