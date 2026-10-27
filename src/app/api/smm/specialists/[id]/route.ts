// SMM SPECIALIST [id] — DELETE removes the specialist's OWN marketplace card
// (their personal price-list roles + the «specialist» flag). Somebody else's
// card is refused — the same owner-guard the test deletes keep.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { deleteSpecialistCard } from "@/server/services/smm2.service";

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deleteSpecialistCard(userId, params.id));
});
