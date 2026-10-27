// SMM DEALS — both-side completion confirmation (Mercur order lifecycle):
// each side confirms the deal is done; when BOTH have confirmed the deal
// flips to «completed» and the reviews for it unlock.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { completeDeal } from "@/server/services/smm2.service";

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await completeDeal(userId, String(body?.dealType || ""), String(body?.dealId || "")));
});
