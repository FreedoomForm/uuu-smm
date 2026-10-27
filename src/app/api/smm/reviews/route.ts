// SMM REVIEWS — the Mercur/Sharetribe deal reviews:
//   GET  ?userId=…        → reviews received by a user (profile/catalog block)
//   POST {dealType,dealId,rating,comment} → review a COMPLETED deal (1..5)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { createReview, listUserReviews } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ searchParams }) => {
  const userId = searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  return NextResponse.json(await listUserReviews(userId));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createReview(userId, body), { status: 201 });
});
