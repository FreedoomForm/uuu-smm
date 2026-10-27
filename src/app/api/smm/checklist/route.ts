// ЧЕК-ЛИСТ СДАЧИ — GET: the merged view (event definition + deal state);
// POST: the specialist submits a slot (link or file); PATCH: the customer
// approves/declines a submitted slot.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { getChecklist, submitChecklistItem, decideChecklistItem } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  return NextResponse.json(await getChecklist(userId, searchParams.get("dealType") || "", searchParams.get("dealId") || ""));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await submitChecklistItem(
    userId, String(body.dealType || ""), String(body.dealId || ""),
    Number(body.idx), { value: String(body.value || ""), valueKind: body.valueKind, note: body.note }
  ), { status: 200 });
});

export const PATCH = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await decideChecklistItem(
    userId, String(body.dealType || ""), String(body.dealId || ""),
    Number(body.idx), String(body.decision || "")
  ), { status: 200 });
});
