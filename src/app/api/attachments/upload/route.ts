// POST /api/attachments/upload (multipart: file=<file>) — upload into the
// owner's Telegram channel; data: fallback for small files when the bot is
// not connected.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { uploadAttachmentFile } from "@/server/services/attachments.service";

export const runtime = "nodejs";

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const form = await req.formData();
    return uploadAttachmentFile(userId, form);
  },
  { rateLimit: "upload" }
);
