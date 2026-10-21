// SMM PROFILE — the author window opened by tapping a card's author strip:
// the identity (specialist 4 params when roles exist) + their posts + their
// PUBLIC мероприятия (personal customer events never leak through it).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { getSmmProfile } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  return NextResponse.json(await getSmmProfile(userId, searchParams.get("userId") || ""));
});
