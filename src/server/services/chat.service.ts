// ---------------------------------------------------------------------------
// Group chat service — the per-test public chat (user ↔ user).
// GET  ?after=<ISO> — poll messages after a timestamp (public, read-only)
// POST              — send a message (any signed-in user)
// The client polls GET every few seconds; serverless-friendly (no sockets).
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";

const HISTORY_LIMIT = 200;

// Messages carry the author's profile photo so the client can render a
// clickable avatar that opens the author's library.
const withUser = { user: { select: { id: true, name: true, image: true } } } as const;

function flatten(m: any) {
  return {
    ...m,
    userName: m.userName || m.user?.name || "User",
    userImage: m.user?.image ?? null,
  };
}

export async function getGroupMessages(testId: string, after?: string) {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!test) throw ApiError.notFound("Test not found");

  if (after) {
    const afterDate = new Date(after);
    if (!isNaN(afterDate.getTime())) {
      const messages = await db.chatMessage.findMany({
        where: { testId, createdAt: { gt: afterDate } },
        orderBy: { createdAt: "asc" },
        take: HISTORY_LIMIT,
        include: withUser,
      });
      return messages.map(flatten);
    }
  }

  const messages = await db.chatMessage.findMany({
    where: { testId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    include: withUser,
  });
  // Return oldest → newest for direct rendering
  return messages.reverse().map(flatten);
}

export async function sendGroupMessage(
  testId: string,
  userId: string,
  text: string
) {
  const test = await db.test.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!test) throw ApiError.notFound("Test not found");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true },
  });
  if (!user) throw ApiError.unauthorized("Not authenticated");

  const message = await db.chatMessage.create({
    data: {
      testId,
      userId: user.id,
      userName: user.name,
      text,
    },
    include: withUser,
  });
  return flatten(message);
}
