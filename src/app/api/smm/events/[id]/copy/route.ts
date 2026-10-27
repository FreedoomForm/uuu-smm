// SMM EVENT COPY — «Изменить» on somebody else's мероприятие: the card is
// NEVER edited in place. The server makes a private VERSION of the original
// (parentId = the source) that lands in the copier's ЛИЧНАЯ библиотека and
// opens in the editor — the exact mechanic startEditTest keeps for tests.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { copyEvent } from "@/server/services/smm2.service";

export const POST = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await copyEvent(userId, params.id), { status: 201 });
});
