// Personal-library bookmarks.
// GET            → { ids: string[] } — every test the user bookmarked
// POST { testId }    → save a test to the user's library (idempotent)
// DELETE ?testId=…   → remove the test from the user's library
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { bookmarkSchema } from "@/server/schemas";
import {
  addBookmark,
  listBookmarks,
  removeBookmark,
} from "@/server/services/bookmarks.service";

export const GET = withApiAuth(async ({ userId }) => {
  const result = await listBookmarks(userId);
  return NextResponse.json(result);
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, bookmarkSchema);
    const result = await addBookmark(userId, body.testId);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(async ({ userId, searchParams }) => {
  const testId = searchParams.get("testId") || "";
  if (!testId) {
    return NextResponse.json({ error: "testId required" }, { status: 400 });
  }
  const result = await removeBookmark(userId, testId);
  return NextResponse.json(result);
});
