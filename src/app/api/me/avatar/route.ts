// POST /api/me/avatar (multipart: file=<image>) — profile photo upload.
// Stored in the Telegram channel (tg: reference) with a small-image data:
// fallback when the bot is offline.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { uploadAvatar } from "@/server/services/me.service";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const result = await uploadAvatar(userId, form.get("file") as File | null);
    return NextResponse.json(result);
  },
  { rateLimit: "upload" }
);
