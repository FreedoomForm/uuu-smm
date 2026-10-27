// SMM APPLICATION [id] — withdraw a pending заявка · PATCH: the customer
// accepts/declines it (Mercur deal lifecycle: accept = the deal starts)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { withdrawApplication, decideApplication } from "@/server/services/smm2.service";

export const PATCH = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await decideApplication(userId, params.id, String(body?.decision || "")));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await withdrawApplication(userId, params.id));
});
