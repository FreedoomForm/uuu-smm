/**
 * Telegram attachment storage.
 *
 * Attached files are uploaded INTO the owner's Telegram channel via the Bot
 * API (sendDocument) and are NEVER stored anywhere else: the DB keeps only a
 * lightweight reference `tg:<file_id>` in Attachment.url. Downloads are served
 * by /api/attachments/[id]/file, which resolves the file_id through getFile
 * and streams the bytes to the client (Range requests included).
 *
 * Configuration (in .env / Vercel env):
 *   TELEGRAM_BOT_TOKEN  — bot token from @BotFather; the bot must be an ADMIN
 *                         of the target channel (it needs "Post messages").
 *   TELEGRAM_CHANNEL_ID — @publicname or -100... numeric id of the channel.
 *                         (An invite link like https://t.me/+... is NOT an id.)
 *
 * When the variables are not set the helpers below report "not configured"
 * and callers transparently fall back to the previous storage (data: URL in
 * the DB for small files) — nothing breaks, files just stay where they were.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';

export const TG_API = 'https://api.telegram.org';
// Bot API accepts documents up to 50 MB via sendDocument (multipart upload).
export const TG_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function telegramConfigured(): boolean {
  return !!(BOT_TOKEN && CHANNEL_ID);
}

export type TgUploadResult = { fileId: string; name: string; size: number; messageId: number | null };

/** Upload one file into the configured channel as a document (no compression). */
export async function telegramUpload(opts: {
  name: string;
  buffer: Buffer;
  contentType?: string;
}): Promise<TgUploadResult> {
  if (!telegramConfigured()) throw new Error('TELEGRAM_NOT_CONFIGURED');
  if (opts.buffer.length > TG_MAX_UPLOAD_BYTES) throw new Error('TELEGRAM_TOO_LARGE');

  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  const bytes = new Uint8Array(opts.buffer);
  form.append(
    'document',
    new Blob([bytes], { type: opts.contentType || 'application/octet-stream' }),
    opts.name
  );

  const res = await fetch(`${BOT_API_BASE()}/sendDocument`, { method: 'POST', body: form });
  const body: any = await res.json().catch(() => null);
  // Telegram auto-detects the content type: an mp3 arrives as result.AUDIO,
  // an mp4 may arrive as result.VIDEO — every flavour carries file_id.
  const doc = body?.result?.document || body?.result?.audio || body?.result?.video || body?.result?.voice;
  if (!res.ok || !body?.ok || !doc?.file_id) {
    const desc = body?.description || `HTTP ${res.status}`;
    throw new Error(`TELEGRAM_UPLOAD_FAILED: ${desc}`);
  }
  return {
    fileId: doc.file_id as string,
    name: (doc.file_name as string) || opts.name,
    size: Number(doc.file_size) || opts.buffer.length,
    // The channel post carrying the file — required to delete it later.
    messageId: typeof body?.result?.message_id === 'number' ? body.result.message_id : null,
  };
}

/**
 * Delete a previously uploaded file's channel post. Only posts uploaded after
 * tgMessageId bookkeeping was introduced can be removed (older rows have no
 * message id — Bot API offers no lookup by file_id, so those stay in the
 * channel as harmless orphans).
 */
export async function telegramDeleteFile(fileId: string, messageId: number | null): Promise<boolean> {
  if (!telegramConfigured() || !messageId) return false;
  try {
    const res = await fetch(`${BOT_API_BASE()}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHANNEL_ID, message_id: messageId }),
    });
    const body: any = await res.json().catch(() => null);
    return !!(res.ok && body?.ok);
  } catch {
    return false;
  }
}

function BOT_API_BASE() {
  return `${TG_API}/bot${BOT_TOKEN}`;
}

/**
 * Fire-and-forget channel notification for marketplace events (deal accepted,
 * deal completed, new review). Never throws — the caller's flow must not
 * break because the channel is down; returns true when delivered.
 */
export async function telegramNotify(text: string): Promise<boolean> {
  if (!telegramConfigured()) return false;
  try {
    const res = await fetch(`${BOT_API_BASE()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHANNEL_ID, text, disable_web_page_preview: true }),
    });
    const body: any = await res.json().catch(() => null);
    return !!(res.ok && body?.ok);
  } catch {
    return false;
  }
}

/** Resolve a file_id to a short-lived direct download URL (Bot API getFile). */
export async function telegramFileUrl(fileId: string): Promise<string> {
  if (!telegramConfigured()) throw new Error('TELEGRAM_NOT_CONFIGURED');
  const res = await fetch(`${BOT_API_BASE()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const body: any = await res.json().catch(() => null);
  if (!res.ok || !body?.ok || !body?.result?.file_path) {
    const desc = body?.description || `HTTP ${res.status}`;
    throw new Error(`TELEGRAM_GETFILE_FAILED: ${desc}`);
  }
  // Download URL format: https://api.telegram.org/file/bot<token>/<file_path>
  return `${TG_API}/file/bot${BOT_TOKEN}/${body.result.file_path}`;
}
