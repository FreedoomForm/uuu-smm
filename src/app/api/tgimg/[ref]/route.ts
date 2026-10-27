// GET /api/tgimg/<file_id> — stream a PHOTO that lives in the owner's Telegram
// channel (question photos and per-option photos on Question rows).
//
// The DB keeps only a lightweight `tg:<file_id>` reference; this route resolves
// it through Bot API getFile and streams the bytes. Image type is detected by
// MAGIC BYTES — anything else is refused, non-images never leave the channel.
import { NextResponse } from "next/server";
import { telegramConfigured, telegramFileUrl } from "@/lib/telegram";
import { withApi } from "@/server/http/handler";

export const runtime = "nodejs";

function sniffImage(buf: Uint8Array): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp";
  return null;
}

export const GET = withApi(async (ctx) => {
  const fid = decodeURIComponent(ctx.params.ref || "").trim();
  if (!fid || !telegramConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const url = await telegramFileUrl(fid);
    const upstream = await fetch(url);
    if (!upstream.ok) return new NextResponse("Not found", { status: 404 });

    // Photos are small (the editor downscales to ≤1600px JPEG), buffering is fine
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    const ct = sniffImage(bytes);
    if (!ct) return new NextResponse("Not found", { status: 404 });

    return new NextResponse(bytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": ct,
        // file_id → content mapping is stable; cache hard like an immutable asset
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
});
