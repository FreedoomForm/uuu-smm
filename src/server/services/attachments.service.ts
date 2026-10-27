// ---------------------------------------------------------------------------
// Attachments service — files attached to tests.
//   GET    /api/tests/[id]/attachments   → list (public)
//   POST   /api/tests/[id]/attachments   → add a link/metadata record
//   PUT    /api/attachments/[id]         → edit metadata
//   DELETE /api/attachments/[id]         → remove (+ best-effort channel cleanup)
//   POST   /api/attachments/upload       → multipart upload into the Telegram
//                                           channel (data: fallback for small
//                                           files when the bot is offline)
// The byte-streaming path (GET /api/attachments/[id]/file) keeps its own
// route — it serves raw bytes with Range support and is not a JSON endpoint.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { telegramConfigured, telegramUpload, telegramDeleteFile, TG_MAX_UPLOAD_BYTES } from "@/lib/telegram";
import { ApiError } from "@/server/http/errors";

// --------------------------------------------------------------------- list --

export async function listAttachments(testId: string) {
  return db.attachment.findMany({
    where: { testId },
    orderBy: { orderNum: "asc" },
    select: {
      id: true,
      testId: true,
      title: true,
      type: true,
      url: true,
      size: true,
      orderNum: true,
      createdAt: true,
    },
  });
}

// ----------------------------------------------------------------------- add --

export async function addAttachment(
  testId: string,
  input: { title?: string; type?: string; url: string; size?: number | null }
) {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!test) throw ApiError.notFound("Test not found");
  // Any authenticated user may attach files to any test (open editing policy)

  const count = await db.attachment.count({ where: { testId } });

  return db.attachment.create({
    data: {
      testId,
      title: input.title || "Attachment",
      type: input.type || "link",
      url: input.url,
      size: typeof input.size === "number" ? input.size : null,
      orderNum: count,
    },
  });
}

// ---------------------------------------------------------------- update/delete --

export async function updateAttachment(
  id: string,
  input: { title?: string; type?: string; url?: string; size?: number | null; orderNum?: number }
) {
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) throw ApiError.notFound("Attachment not found");

  return db.attachment.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.url !== undefined && { url: input.url }),
      ...(input.size !== undefined && { size: input.size }),
      ...(input.orderNum !== undefined && { orderNum: input.orderNum }),
    },
  });
}

export async function deleteAttachment(id: string) {
  const attachment = await db.attachment.findUnique({ where: { id } });
  if (!attachment) throw ApiError.notFound("Attachment not found");

  await db.attachment.delete({ where: { id } });
  // If the file lived in the Telegram channel, clean the channel post too
  // (best-effort — same policy as test deletion)
  if (attachment.url.startsWith("tg:") && attachment.tgMessageId) {
    telegramDeleteFile(attachment.url.slice(3), attachment.tgMessageId).catch(
      () => {}
    );
  }
  return { success: true };
}

// -------------------------------------------------------------------- upload --

const DB_FALLBACK_LIMIT = 3.5 * 1024 * 1024;

export async function uploadAttachmentFile(
  userId: string,
  form: FormData
): Promise<Response> {
  const { NextResponse } = await import("next/server");

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw ApiError.badRequest("No file provided");
  }
  // Photo uploads (question / option photos) ask for kind=image — hard-check
  // the MIME so the channel never receives non-images through that path
  if (form.get("kind") === "image" && !(file.type || "").startsWith("image/")) {
    throw ApiError.badRequest("NOT_AN_IMAGE");
  }
  if (file.size > TG_MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "FILE_TOO_LARGE", max: TG_MAX_UPLOAD_BYTES },
      { status: 413 }
    );
  }

  if (telegramConfigured()) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const up = await telegramUpload({
        name: file.name || "attachment",
        buffer,
        contentType: file.type || "application/octet-stream",
      });
      return NextResponse.json({
        ok: true,
        kind: "telegram",
        url: `tg:${up.fileId}`,
        name: up.name,
        size: up.size,
        // Channel post id — flows back with the save payload so the file can
        // be deleted from the channel when it is removed from the test.
        tgMessageId: up.messageId,
      });
    } catch (e: any) {
      // Telegram hiccup: fall through to the data: fallback when possible,
      // otherwise surface the error so the user can retry.
      if (file.size > DB_FALLBACK_LIMIT) {
        return NextResponse.json(
          { error: "TELEGRAM_UPLOAD_FAILED", detail: String(e?.message || e) },
          { status: 502 }
        );
      }
    }
  }

  if (file.size > DB_FALLBACK_LIMIT) {
    return NextResponse.json(
      {
        error: "FILE_STORAGE_UNAVAILABLE",
        detail:
          "Telegram storage is not configured and the file exceeds the in-DB fallback limit",
      },
      { status: 503 }
    );
  }

  // Legacy fallback — small files as data: URL inside the DB
  const buffer = Buffer.from(await file.arrayBuffer());
  const dataUrl = `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
  return NextResponse.json({ ok: true, kind: "data", url: dataUrl, size: file.size });
}
