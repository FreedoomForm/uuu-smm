// ---------------------------------------------------------------------------
// Me service — the signed-in user's own profile, interests and avatar.
//   GET    /api/me            → profile (name, email, background preset)
//   PUT    /api/me            → update name / background
//   DELETE /api/me            → permanently delete the account (+ channel files)
//   GET/PUT /api/me/interests → onboarding interests (seeds the For You feed)
//   POST   /api/me/avatar     → profile photo (stored in the Telegram channel)
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { seedInterests } from "@/lib/affinity";
import { popularTags } from "@/lib/popular";
import { telegramDeleteFile, telegramConfigured, telegramUpload } from "@/lib/telegram";
import { ApiError } from "@/server/http/errors";
import { collectUserChannelFiles } from "./telegram-cleanup";

// ------------------------------------------------------------------- profile --

export async function getProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, bgStyle: true, lang: true, image: true, smmRole: true, smmRating: true },
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateProfile(
  userId: string,
  body: { name?: string; bgStyle?: string; lang?: string; smmRole?: string }
) {
  const data: { name?: string; bgStyle?: string; lang?: string; smmRole?: string } = {};

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) throw ApiError.badRequest("Name cannot be empty");
    if (name.length > 60) throw ApiError.badRequest("Name is too long");
    data.name = name;
  }
  if (typeof body.bgStyle === "string") {
    // Store the preset key only — the concrete CSS lives on the client,
    // so future presets keep working for everyone.
    data.bgStyle = body.bgStyle.slice(0, 40);
  }
  if (typeof body.lang === "string") {
    // Interface language lives in the DB (User.lang) — never on the device.
    if (!["en", "ru", "uz"].includes(body.lang)) {
      throw ApiError.badRequest("Unsupported language");
    }
    data.lang = body.lang;
  }
  if (body.smmRole === "specialist" || body.smmRole === "customer") {
    // The SMM mode switcher (the second bottom panel) — persisted per account
    data.smmRole = body.smmRole;
  }

  if (Object.keys(data).length === 0) {
    throw ApiError.badRequest("Nothing to update");
  }

  return db.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, name: true, bgStyle: true, lang: true, smmRole: true, smmRating: true },
  });
}

export async function deleteAccount(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) throw ApiError.notFound("User not found");

  // Collect every Telegram-hosted file BEFORE the cascade wipes the rows.
  const channelFiles = await collectUserChannelFiles(userId);

  // The Test→User relation is Restrict (no cascade), so the user's own
  // tests must go first — the Test-side cascades wipe their questions,
  // attachments, attempts, bookmarks and chats in the same round.
  await db.test.deleteMany({ where: { creatorId: userId } });
  await db.user.delete({ where: { id: userId } });

  // Best-effort channel cleanup — the account is already gone at this point.
  await Promise.allSettled(
    channelFiles.map((f) => telegramDeleteFile(f.fileId, f.msgId))
  );

  return { success: true };
}

// ----------------------------------------------------------------- interests --

const MAX_INTERESTS = 12;

function sanitizeInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string" && typeof r !== "number") continue;
    const t = String(r).trim().replace(/\s+/g, " ").slice(0, 30);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

export async function getInterests(userId: string) {
  const [user, suggestions] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { interests: true } }),
    popularTags().catch(() => []),
  ]);
  return {
    interests: user?.interests || [],
    suggestions: suggestions.map((s) => s.tag),
  };
}

export async function saveInterests(userId: string, rawInterests: unknown) {
  const clean = sanitizeInterests(rawInterests);
  await db.user.update({
    where: { id: userId },
    data: { interests: clean },
  });
  // Seed the affinity profile so the For You feed reacts immediately
  await seedInterests(userId, clean).catch(() => {});
  return { interests: clean, ok: true };
}

// -------------------------------------------------------------------- avatar --

const TG_AVATAR_MAX = 8 * 1024 * 1024; // hard cap for the raw request body
const DB_FALLBACK_LIMIT = 300 * 1024;

export async function uploadAvatar(userId: string, file: File | null) {
  if (!(file instanceof File)) {
    throw ApiError.badRequest("No file provided");
  }
  if (file.size > TG_AVATAR_MAX) {
    throw ApiError.payloadTooLarge("FILE_TOO_LARGE");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "image/jpeg";
  const name = `avatar-${userId}.${contentType.includes("png") ? "png" : "jpg"}`;

  if (telegramConfigured()) {
    try {
      const up = await telegramUpload({ name, buffer, contentType });
      await db.user.update({
        where: { id: userId },
        data: { image: `tg:${up.fileId}` },
      });
      return {
        ok: true,
        kind: "telegram",
        avatarUrl: `/api/users/${userId}/avatar`,
      };
    } catch (e) {
      // fall through to the inline fallback for small images
      if (buffer.length > DB_FALLBACK_LIMIT) {
        console.error("Avatar upload to Telegram failed:", e);
        throw new ApiError({
          code: "internal_server_error",
          message: "AVATAR_UPLOAD_FAILED",
        });
      }
    }
  } else if (buffer.length > DB_FALLBACK_LIMIT) {
    throw new ApiError({
      code: "payload_too_large",
      message: "FILE_TOO_LARGE",
    });
  }

  const dataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  await db.user.update({ where: { id: userId }, data: { image: dataUrl } });
  return { ok: true, kind: "data", avatarUrl: `/api/users/${userId}/avatar` };
}
