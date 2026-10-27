// ---------------------------------------------------------------------------
// Spots service — the public PHOTO-SPOTS MAP (столп 3 of the tourism × SMM
// idea): beautiful places with shooting tips («где снимать, в какое время,
// какой ракурс»). The LIST is open to every visitor (free search traffic —
// the page renders without a session); creating/editing is for signed-in
// users; a spot is editable ONLY by its author.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";

export type SpotMedia = { url: string; type: string; title?: string };

function asMedia(value: unknown): SpotMedia[] {
  if (!Array.isArray(value)) return [];
  const out: SpotMedia[] = [];
  for (const raw of value.slice(0, 12)) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.url !== "string" || !m.url.trim()) continue;
    out.push({
      url: m.url.slice(0, 400),
      type: typeof m.type === "string" ? m.type.slice(0, 20) : "image",
      title: typeof m.title === "string" ? m.title.slice(0, 200) : undefined,
    });
  }
  return out;
}

function spotPayload(body: Record<string, unknown>, forCreate: boolean) {
  const data: Record<string, unknown> = {};
  const str = (k: string, max: number) =>
    typeof body[k] === "string" ? (body[k] as string).slice(0, max) : undefined;

  const title = str("title", 200);
  if (forCreate && !title?.trim()) throw ApiError.badRequest("Title required");
  if (title !== undefined) data.title = title.trim() || "Фото-спот";

  for (const [k, max] of Object.entries({
    description: 6000,
    place: 300,
    bestTime: 300,
    angleTips: 3000,
  })) {
    const v = str(k, max);
    if (v !== undefined) data[k] = v;
  }

  // Map pin: decimal degrees as strings, sanity-checked as floats
  for (const k of ["lat", "lng"] as const) {
    if (body[k] !== undefined) {
      const n = Number(body[k]);
      if (!Number.isFinite(n)) throw ApiError.badRequest("Bad coordinates");
      const inRange = k === "lat" ? Math.abs(n) <= 90 : Math.abs(n) <= 180;
      if (!inRange) throw ApiError.badRequest("Coordinates out of range");
      data[k] = String(n);
    }
  }
  if (forCreate && (data.lat === undefined || data.lng === undefined)) {
    throw ApiError.badRequest("Coordinates required");
  }

  const media = asMedia(body.media);
  if (body.media !== undefined) data.media = media.length ? media : null;

  if (Array.isArray(body.tags)) {
    data.tags = (body.tags as unknown[])
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 10);
  }
  if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;
  return data;
}

const spotInclude = {
  author: { select: { id: true, name: true, image: true, smmPremium: true } },
};

/** Public map feed (every visitor) or the author's own list (?scope=mine). */
export async function listSpots(scope: string, userId?: string) {
  if (scope === "mine") {
    if (!userId) throw ApiError.unauthorized();
    return db.photoSpot.findMany({
      where: { authorId: userId },
      include: spotInclude,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
  return db.photoSpot.findMany({
    where: { isPublic: true },
    include: spotInclude,
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function createSpot(userId: string, body: Record<string, unknown>) {
  const data = spotPayload(body, true);
  const spot = await db.photoSpot.create({
    data: { ...(data as any), authorId: userId },
    include: spotInclude,
  });
  return spot;
}

export async function updateSpot(userId: string, id: string, body: Record<string, unknown>) {
  const spot = await db.photoSpot.findUnique({ where: { id } });
  if (!spot) throw ApiError.notFound("Spot not found");
  if (spot.authorId !== userId) throw ApiError.forbidden("Not your spot");
  const data = spotPayload(body, false);
  const updated = await db.photoSpot.update({ where: { id }, data, include: spotInclude });
  return updated;
}

export async function deleteSpot(userId: string, id: string) {
  const spot = await db.photoSpot.findUnique({ where: { id } });
  if (!spot) throw ApiError.notFound("Spot not found");
  if (spot.authorId !== userId) throw ApiError.forbidden("Not your spot");
  await db.photoSpot.delete({ where: { id } });
  return { ok: true };
}
