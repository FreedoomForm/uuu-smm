// SMM POST COPY — «Изменить» on somebody else's пост: the card is NEVER
// edited in place. The server makes a private VERSION of the original
// (parentId = the source) in the copier's personal library — the copier gets
// their own role with the source's name + prices; media and attached files
// ride along. The exact mechanic startEditTest keeps for tests.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { copyPost } from "@/server/services/smm2.service";

export const POST = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await copyPost(userId, params.id), { status: 201 });
});
