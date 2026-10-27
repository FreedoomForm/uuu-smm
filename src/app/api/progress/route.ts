// /api/progress — the signed-in user's saved in-test state ("Continue Test").
// GET    ?testId=…  → { progress, savedAt }   (progress = null when none)
// PUT               → upsert { testId, data }  (data = full SavedTestProgress)
// DELETE ?testId=…  → clear (called on submit)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { z } from "zod";
import { getProgress, saveProgress, clearProgress } from "@/server/services/progress.service";

export const runtime = "nodejs";

const progressSchema = z.object({
  testId: z.string().min(1).max(64),
  data: z.record(z.string(), z.unknown()),
});

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  const testId = searchParams.get("testId") || "";
  if (!testId) return NextResponse.json({ progress: null, savedAt: null });
  return NextResponse.json(await getProgress(userId, testId));
});

export const PUT = withApiAuth(async ({ userId, req }) => {
  const body = await parseBody(req, progressSchema);
  return NextResponse.json(await saveProgress(userId, body.testId, body.data));
});

export const DELETE = withApiAuth(async ({ userId, searchParams }) => {
  const testId = searchParams.get("testId") || "";
  if (!testId) return NextResponse.json({ ok: true });
  return NextResponse.json(await clearProgress(userId, testId));
});
