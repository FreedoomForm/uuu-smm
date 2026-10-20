// GET    /api/smm/bookmarks?targetType=specialist|event|request|role — pinned ids
// POST   /api/smm/bookmarks — pin a specialist / event / запрос / role template
//        to the personal library
// DELETE /api/smm/bookmarks?targetType=…&targetId=… — unpin
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmBookmarkSchema } from "@/server/schemas";
import { addSmmBookmark, listSmmBookmarks, removeSmmBookmark } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  const t = searchParams.get("targetType");
  const targetType = t === "specialist" || t === "event" || t === "request" || t === "role" ? t : undefined;
  return NextResponse.json(await listSmmBookmarks(userId, targetType));
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, smmBookmarkSchema);
    return NextResponse.json(await addSmmBookmark(userId, body.targetType, body.targetId));
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(
  async ({ userId, searchParams }) => {
    const t = searchParams.get("targetType");
    const targetType = t === "specialist" || t === "event" || t === "request" || t === "role" ? t : null;
    const targetId = (searchParams.get("targetId") || "").slice(0, 64);
    if (!targetType || !targetId) throw new Error("targetType and targetId are required");
    return NextResponse.json(await removeSmmBookmark(userId, targetType, targetId));
  },
  { rateLimit: "testWrite" }
);
