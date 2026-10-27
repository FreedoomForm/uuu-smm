// ---------------------------------------------------------------------------
// AI-tutor threads — MANY conversations per (user, test): the «Новый чат»
// button starts a fresh thread while the old ones stay in the drawer list.
// Stored in the DATABASE; previously `ai_threads_<uid>` in localStorage and
// later one-row-per-(user, test).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";

// A thread is a tutor conversation, not an archive: 200 messages / 256 KB
// is far beyond any real tutoring session.
const MAX_MESSAGES = 200;
const MAX_JSON_CHARS = 262_144;

export async function listThreads(userId: string) {
  const rows = await db.aiThread.findMany({
    where: { userId },
    select: { id: true, testId: true, title: true, messages: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return {
    threads: rows.map(r => ({
      id: r.id,
      testId: r.testId,
      title: r.title,
      messages: r.messages,
      updatedAt: r.updatedAt.getTime(),
    })),
  };
}

export async function saveThread(
  userId: string,
  input: { id?: string; testId: string; title: string; messages: unknown }
) {
  const { id, testId, title, messages } = input;
  if (!testId || typeof testId !== "string" || testId.length > 64) {
    throw ApiError.badRequest("Invalid testId");
  }
  if (!Array.isArray(messages)) {
    throw ApiError.badRequest("Invalid messages payload");
  }
  const trimmed = messages.slice(-MAX_MESSAGES);
  if (JSON.stringify(trimmed).length > MAX_JSON_CHARS) {
    throw ApiError.badRequest("Thread too large");
  }
  const data = {
    testId,
    title: String(title || "").slice(0, 200),
    messages: trimmed,
  };
  // The client keeps its own thread keys (UUIDs). A known key of THIS user
  // updates in place; anything else creates a row (with the client key when
  // it is free, otherwise a fresh server id — the response always carries
  // the id the client should keep using).
  if (id) {
    const existing = await db.aiThread.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (existing) {
      await db.aiThread.update({ where: { id: existing.id }, data });
      return { ok: true, id: existing.id };
    }
    try {
      const row = await db.aiThread.create({ data: { id, userId, ...data } });
      return { ok: true, id: row.id };
    } catch {
      // Primary-key collision (the key belongs to another user) → server id.
      const row = await db.aiThread.create({ data: { userId, ...data } });
      return { ok: true, id: row.id };
    }
  }
  const row = await db.aiThread.create({ data: { userId, ...data } });
  return { ok: true, id: row.id };
}
