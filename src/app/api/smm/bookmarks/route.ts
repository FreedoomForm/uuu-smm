// SMM BOOKMARKS — the закладки window (events / specialists / posts)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listSmmBookmarks, addSmmBookmark, removeSmmBookmark } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId }) => {
  return NextResponse.json(await listSmmBookmarks(userId));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await addSmmBookmark(userId, String(body.targetType || ""), String(body.targetId || "")), { status: 201 });
});

export const DELETE = withApiAuth(async ({ userId, searchParams }) => {
  const targetType = searchParams.get("targetType") || "";
  const targetId = searchParams.get("targetId") || "";
  if (!targetType || !targetId) {
    return NextResponse.json({ error: "targetType and targetId required" }, { status: 400 });
  }
  return NextResponse.json(await removeSmmBookmark(userId, targetType, targetId));
});
