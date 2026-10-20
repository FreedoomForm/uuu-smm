// SMM APPLICATION [id] — withdraw a pending заявка
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { withdrawApplication } from "@/server/services/smm2.service";

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await withdrawApplication(userId, params.id));
});
