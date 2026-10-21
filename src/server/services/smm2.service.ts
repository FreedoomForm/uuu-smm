// ---------------------------------------------------------------------------
// SMM v2 service — the mode-switcher marketplace built ON the tests site:
// posts (per role), events (the 4 facts + qualification tests), specialists,
// заявки/приглашения, chats and SMM bookmarks. Every function is
// user-scoped; ownership is enforced server-side.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "../http/errors";

type PostMedia = { url: string; type: "video" | "image"; title?: string };

const publicUser = {
  select: { id: true, name: true, image: true },
};

function asMedia(v: unknown): PostMedia[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((m: any) => m && typeof m.url === "string" && m.url.length < 4000000)
    .slice(0, 30)
    .map((m: any) => ({
      url: String(m.url),
      type: m.type === "video" ? "video" : "image",
      ...(typeof m.title === "string" ? { title: m.title.slice(0, 200) } : {}),
    }));
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : (v as number);
  return typeof n === "number" && isFinite(n) && n >= 0 ? n : null;
}

// ── POSTS ───────────────────────────────────────────────────────────────────

export async function listPosts(userId: string, scope: string, targetUserId?: string) {
  if (scope === "user" && targetUserId) {
    // Another user's posts (opened from their card/profile)
    const rows = await db.smmPost.findMany({
      where: { specialistId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } },
        specialist: publicUser,
      },
    });
    return { items: rows };
  }
  const rows = await db.smmPost.findMany({
    where: { specialistId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } },
      specialist: publicUser,
    },
  });
  return { items: rows };
}

async function upsertRoleForPost(
  userId: string,
  roleId: string | undefined,
  role: { name: string; pricePerK?: unknown; pricePerDay?: unknown } | undefined
) {
  if (roleId) {
    const existing = await db.smmRole.findUnique({ where: { id: roleId } });
    if (!existing) throw ApiError.notFound("Role not found");
    if (existing.ownerId && existing.ownerId !== userId) throw ApiError.forbidden("Not your role");
    return existing;
  }
  if (!role || !role.name?.trim()) throw ApiError.badRequest("Role name required");
  const name = role.name.trim().slice(0, 120);
  // Role reuse: the specialist's roles are unique by name — sending the same
  // name again targets the SAME role (so the one-post-per-role rule fires).
  const existing = await db.smmRole.findFirst({ where: { ownerId: userId, name } });
  if (existing) {
    return db.smmRole.update({
      where: { id: existing.id },
      data: {
        ...(role.pricePerK !== undefined ? { pricePerK: numOrNull(role.pricePerK) } : {}),
        ...(role.pricePerDay !== undefined ? { pricePerDay: numOrNull(role.pricePerDay) } : {}),
      },
    });
  }
  return db.smmRole.create({
    data: {
      name,
      ownerId: userId,
      authorId: userId,
      isPublic: true,
      pricePerK: numOrNull(role.pricePerK),
      pricePerDay: numOrNull(role.pricePerDay),
    },
  });
}

export async function createPost(
  userId: string,
  body: {
    roleId?: string;
    role?: { name: string; pricePerK?: unknown; pricePerDay?: unknown };
    description?: string;
    media?: unknown;
    coverColor?: unknown;
    coverIcon?: unknown;
  }
) {
  const role = await upsertRoleForPost(userId, body.roleId, body.role);
  const taken = await db.smmPost.findUnique({ where: { roleId: role.id } });
  if (taken) throw ApiError.conflict("This role already has a post");
  const post = await db.smmPost.create({
    data: {
      specialistId: userId,
      roleId: role.id,
      description: String(body.description || "").slice(0, 8000),
      media: asMedia(body.media),
      coverColor: typeof body.coverColor === "string" ? body.coverColor.slice(0, 32) : null,
      coverIcon: typeof body.coverIcon === "string" ? body.coverIcon.slice(0, 16) : null,
    },
    include: {
      role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } },
      specialist: publicUser,
    },
  });
  return post;
}

async function ownPost(userId: string, id: string) {
  const post = await db.smmPost.findUnique({ where: { id } });
  if (!post) throw ApiError.notFound("Post not found");
  if (post.specialistId !== userId) throw ApiError.forbidden("Not your post");
  return post;
}

export async function updatePost(
  userId: string,
  id: string,
  body: {
    roleId?: string;
    role?: { name?: string; pricePerK?: unknown; pricePerDay?: unknown };
    description?: string;
    media?: unknown;
    coverColor?: unknown;
    coverIcon?: unknown;
  }
) {
  await ownPost(userId, id);
  const data: Record<string, unknown> = {};
  if (body.roleId) {
    const role = await upsertRoleForPost(userId, body.roleId, undefined);
    const taken = await db.smmPost.findUnique({ where: { roleId: role.id } });
    if (taken && taken.id !== id) throw ApiError.conflict("This role already has a post");
    data.roleId = role.id;
  }
  if (body.role && typeof body.role.name === "string" && body.role.name.trim()) {
    // rename / reprice the post's own role
    const cur = await db.smmPost.findUnique({ where: { id }, include: { role: true } });
    if (cur?.role && (cur.role.ownerId === userId || !cur.role.ownerId)) {
      await db.smmRole.update({
        where: { id: cur.role.id },
        data: {
          name: body.role.name.trim().slice(0, 120),
          ...(body.role.pricePerK !== undefined ? { pricePerK: numOrNull(body.role.pricePerK) } : {}),
          ...(body.role.pricePerDay !== undefined ? { pricePerDay: numOrNull(body.role.pricePerDay) } : {}),
        },
      });
    }
  }
  if (typeof body.description === "string") data.description = body.description.slice(0, 8000);
  if (body.media !== undefined) data.media = asMedia(body.media);
  if (body.coverColor !== undefined) data.coverColor = typeof body.coverColor === "string" ? body.coverColor.slice(0, 32) : null;
  if (body.coverIcon !== undefined) data.coverIcon = typeof body.coverIcon === "string" ? body.coverIcon.slice(0, 16) : null;
  return db.smmPost.update({
    where: { id },
    data,
    include: {
      role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } },
      specialist: publicUser,
    },
  });
}

export async function deletePost(userId: string, id: string) {
  await ownPost(userId, id);
  await db.smmPost.delete({ where: { id } });
  return { ok: true };
}

// ── EVENTS ──────────────────────────────────────────────────────────────────

const eventInclude = {
  customer: publicUser,
  roles: { select: { id: true, name: true } },
};

function eventTests(testIds: string[]) {
  return (testIds || []).length > 0
    ? db.test.findMany({
        where: { id: { in: testIds } },
        select: { id: true, title: true, _count: { select: { questions: true } } },
      })
    : Promise.resolve([]);
}

export async function listEvents(userId: string, scope: string) {
  const mine = scope !== "public";
  const rows = await db.smmEvent.findMany({
    where: mine ? { customerId: userId } : { isPublic: true },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: eventInclude,
  });
  const withTests = await Promise.all(
    rows.map(async (e) => ({ ...e, tests: await eventTests(e.testIds) }))
  );
  return { items: withTests };
}

export async function getEvent(id: string) {
  const event = await db.smmEvent.findUnique({ where: { id }, include: eventInclude });
  if (!event) throw ApiError.notFound("Event not found");
  return { event: { ...event, tests: await eventTests(event.testIds) } };
}

function eventPayload(userId: string, body: Record<string, unknown>, forCreate: boolean) {
  const data: Record<string, unknown> = {};
  const str = (k: string, max: number) =>
    typeof body[k] === "string" ? (body[k] as string).slice(0, max) : undefined;
  const title = str("title", 200);
  if (forCreate && !title?.trim()) throw ApiError.badRequest("Title required");
  if (title !== undefined) data.title = title.trim() || "Мероприятие";
  const fields = { summary: 4000, brief: 20000, deadline: 200, budget: 200, restrictions: 4000 } as const;
  for (const [k, max] of Object.entries(fields)) {
    const v = str(k, max);
    if (v !== undefined) data[k] = v;
  }
  if (body.format === "online" || body.format === "offline") data.format = body.format;
  if (typeof body.platform === "string") data.platform = body.platform.slice(0, 40);
  if (typeof body.location === "string") data.location = body.location.slice(0, 500);
  if (typeof body.timeAt === "string") data.timeAt = body.timeAt.slice(0, 200);
  if (Array.isArray(body.testIds)) {
    data.testIds = (body.testIds as unknown[]).filter((x) => typeof x === "string").slice(0, 20);
  }
  if (body.coverColor !== undefined) data.coverColor = typeof body.coverColor === "string" ? body.coverColor.slice(0, 32) : null;
  if (body.coverIcon !== undefined) data.coverIcon = typeof body.coverIcon === "string" ? body.coverIcon.slice(0, 16) : null;
  if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;
  return data;
}

export async function createEvent(userId: string, body: Record<string, unknown>) {
  const data = eventPayload(userId, body, true);
  const event = await db.smmEvent.create({
    data: { ...(data as any), customerId: userId },
    include: eventInclude,
  });
  return { ...event, tests: await eventTests(event.testIds) };
}

export async function updateEvent(userId: string, id: string, body: Record<string, unknown>) {
  const event = await db.smmEvent.findUnique({ where: { id } });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.customerId !== userId) throw ApiError.forbidden("Not your event");
  const data = eventPayload(userId, body, false);
  const updated = await db.smmEvent.update({ where: { id }, data, include: eventInclude });
  return { ...updated, tests: await eventTests(updated.testIds) };
}

export async function deleteEvent(userId: string, id: string) {
  const event = await db.smmEvent.findUnique({ where: { id } });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.customerId !== userId) throw ApiError.forbidden("Not your event");
  await db.smmEvent.delete({ where: { id } });
  return { ok: true };
}

// ── SPECIALISTS (the customer's публичная библиотека) ───────────────────────

export async function listSpecialists() {
  const users = await db.user.findMany({
    where: {
      OR: [{ smmRole: "specialist" }, { smmRoles: { some: {} } }],
    },
    select: {
      id: true, name: true, image: true, smmRating: true, smmRole: true,
      smmRoles: {
        where: { ownerId: { not: null } },
        select: { id: true, name: true, pricePerK: true, pricePerDay: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  // Orders completed = the accepted invitations + applications of the user
  const ids = users.map((u) => u.id);
  const [apps, invites] = await Promise.all([
    db.smmApplication.groupBy({
      by: ["specialistId"],
      where: { specialistId: { in: ids }, status: "accepted" },
      _count: { _all: true },
    }),
    db.smmInvitation.groupBy({
      by: ["specialistId"],
      where: { specialistId: { in: ids }, status: "accepted" },
      _count: { _all: true },
    }),
  ]);
  const ordersMap = new Map<string, number>();
  for (const a of apps) ordersMap.set(a.specialistId, (ordersMap.get(a.specialistId) || 0) + a._count._all);
  for (const i of invites) ordersMap.set(i.specialistId, (ordersMap.get(i.specialistId) || 0) + i._count._all);
  const items = users.map((u) => ({
    id: u.id,
    name: u.name,
    image: u.image,
    rating: u.smmRating,
    orders: ordersMap.get(u.id) || 0,
    roles: u.smmRoles,
  }));
  return { items };
}

// ── PROFILE — the author window opened by tapping a card's author strip ─────

// Everything the profile window needs in ONE fetch: the identity (with the
// specialist's 4 params when they have roles) + their posts + their PUBLIC
// events (a customer's personal мероприятия never leak through the profile).
export async function getSmmProfile(viewerId: string, targetUserId: string) {
  if (!targetUserId) throw ApiError.badRequest("userId required");
  const user = await db.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true, name: true, image: true, smmRating: true, smmRole: true,
      smmRoles: {
        where: { ownerId: targetUserId },
        select: { id: true, name: true, pricePerK: true, pricePerDay: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) throw ApiError.notFound("User not found");
  const [apps, invites, posts, events] = await Promise.all([
    db.smmApplication.count({ where: { specialistId: targetUserId, status: "accepted" } }),
    db.smmInvitation.count({ where: { specialistId: targetUserId, status: "accepted" } }),
    db.smmPost.findMany({
      where: { specialistId: targetUserId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } },
        specialist: publicUser,
      },
    }),
    db.smmEvent.findMany({
      where: { customerId: targetUserId, isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: eventInclude,
    }),
  ]);
  const withTests = await Promise.all(
    events.map(async (e) => ({ ...e, tests: await eventTests(e.testIds) }))
  );
  return {
    user: {
      id: user.id,
      name: user.name,
      image: user.image,
      rating: user.smmRating,
      orders: apps + invites,
      mode: user.smmRole,
      roles: user.smmRoles,
    },
    posts,
    events: withTests,
  };
}

// ── ROLES (my own, for the post editor) ─────────────────────────────────────

export async function listMyRoles(userId: string) {
  const items = await db.smmRole.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, pricePerK: true, pricePerDay: true, ownerId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return { items };
}

export async function deleteRole(userId: string, id: string) {
  const role = await db.smmRole.findUnique({ where: { id } });
  if (!role) throw ApiError.notFound("Role not found");
  if (role.ownerId !== userId) throw ApiError.forbidden("Not your role");
  await db.smmRole.delete({ where: { id } });
  return { ok: true };
}

// ── ЗАЯВКИ / ПРИГЛАШЕНИЯ + the direct chat message ──────────────────────────

async function directChatBetween(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const found = await db.smmChat.findFirst({
    where: { kind: "direct", aId: x, bId: y },
  });
  if (found) return found;
  return db.smmChat.create({ data: { kind: "direct", aId: x, bId: y, title: "" } });
}

async function postSystemMessage(chatId: string, userId: string, userName: string, text: string) {
  await db.smmChatMessage.create({
    data: { scopeType: "chat", scopeId: chatId, userId, userName, text, kind: "system" },
  });
  await db.smmChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } });
}

export async function createApplication(
  userId: string,
  userName: string,
  body: { eventId: string; roleId: string; score?: number; totalQuestions?: number }
) {
  // 400 (not a raw Prisma 500) when ids are missing — the API never lets a
  // malformed payload reach the database.
  if (!body?.eventId || !body?.roleId) throw ApiError.badRequest("eventId and roleId required");
  const event = await db.smmEvent.findUnique({ where: { id: body.eventId } });
  if (!event) throw ApiError.notFound("Event not found");
  const role = await db.smmRole.findUnique({ where: { id: body.roleId } });
  if (!role || role.ownerId !== userId) throw ApiError.badRequest("Choose your own role");
  const dup = await db.smmApplication.findFirst({
    where: { eventId: event.id, roleId: role.id, specialistId: userId, status: "pending" },
  });
  if (dup) throw ApiError.conflict("Already applied");
  const app = await db.smmApplication.create({
    data: {
      eventId: event.id,
      roleId: role.id,
      specialistId: userId,
      score: Math.max(0, Math.min(9999, Number(body.score) || 0)),
      totalQuestions: Math.max(0, Math.min(9999, Number(body.totalQuestions) || 0)),
      status: "pending",
    },
  });
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const chat = await directChatBetween(userId, event.customerId);
  await postSystemMessage(
    chat.id,
    userId,
    me?.name || userName,
    `ЗАЯВКА · «${event.title}» · роль «${role.name}» · результат: ${app.score}/${app.totalQuestions} правильных ответов`
  );
  return app;
}

export async function listMyApplications(userId: string) {
  const rows = await db.smmApplication.findMany({
    where: { specialistId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { event: { select: { id: true, title: true } }, role: { select: { id: true, name: true } } },
  });
  const items = rows.map((a) => ({
    id: a.id,
    kind: "application" as const,
    status: a.status,
    createdAt: a.createdAt,
    score: a.score,
    totalQuestions: a.totalQuestions,
    eventId: a.event.id,
    eventTitle: a.event.title,
    roleId: a.role.id,
    roleName: a.role.name,
    counterpartyName: "",
  }));
  return { items };
}

export async function withdrawApplication(userId: string, id: string) {
  const app = await db.smmApplication.findUnique({ where: { id } });
  if (!app) throw ApiError.notFound("Application not found");
  if (app.specialistId !== userId) throw ApiError.forbidden("Not your application");
  if (app.status !== "pending") throw ApiError.conflict("Only pending requests can be withdrawn");
  await db.smmApplication.delete({ where: { id } });
  return { ok: true };
}

export async function createInvitation(
  userId: string,
  userName: string,
  body: { specialistId: string; eventId: string; roleId: string; estimate?: number | null }
) {
  // 400 (not a raw Prisma 500) when ids are missing.
  if (!body?.specialistId || !body?.eventId || !body?.roleId) throw ApiError.badRequest("specialistId, eventId and roleId required");
  const event = await db.smmEvent.findUnique({ where: { id: body.eventId } });
  if (!event) throw ApiError.notFound("Event not found");
  if (event.customerId !== userId) throw ApiError.forbidden("Not your event");
  const role = await db.smmRole.findUnique({ where: { id: body.roleId } });
  if (!role || role.ownerId !== body.specialistId) throw ApiError.badRequest("Choose the specialist's role");
  const dup = await db.smmInvitation.findFirst({
    where: { eventId: event.id, roleId: role.id, specialistId: body.specialistId, customerId: userId, status: "pending" },
  });
  if (dup) throw ApiError.conflict("Already invited");
  const inv = await db.smmInvitation.create({
    data: {
      eventId: event.id,
      roleId: role.id,
      customerId: userId,
      specialistId: body.specialistId,
      estimate: body.estimate == null ? null : Number(body.estimate),
      status: "pending",
    },
  });
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const chat = await directChatBetween(userId, body.specialistId);
  await postSystemMessage(
    chat.id,
    userId,
    me?.name || userName,
    `ПРИГЛАШЕНИЕ · «${event.title}» · роль «${role.name}»${inv.estimate != null ? ` · примерная сумма: ${inv.estimate}` : ""}`
  );
  return inv;
}

export async function listMyInvitations(userId: string) {
  const rows = await db.smmInvitation.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      event: { select: { id: true, title: true } },
      role: { select: { id: true, name: true } },
      specialist: { select: { name: true } },
    },
  });
  const items = rows.map((i) => ({
    id: i.id,
    kind: "invitation" as const,
    status: i.status,
    createdAt: i.createdAt,
    estimate: i.estimate,
    eventId: i.event.id,
    eventTitle: i.event.title,
    roleId: i.role.id,
    roleName: i.role.name,
    counterpartyName: i.specialist?.name || "",
  }));
  return { items };
}

export async function withdrawInvitation(userId: string, id: string) {
  const inv = await db.smmInvitation.findUnique({ where: { id } });
  if (!inv) throw ApiError.notFound("Invitation not found");
  if (inv.customerId !== userId) throw ApiError.forbidden("Not your invitation");
  if (inv.status !== "pending") throw ApiError.conflict("Only pending requests can be withdrawn");
  await db.smmInvitation.delete({ where: { id } });
  return { ok: true };
}

// ── SMM BOOKMARKS (закладки window) ─────────────────────────────────────────

export async function listSmmBookmarks(userId: string) {
  const rows = await db.smmBookmark.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const eventIds = rows.filter((r) => r.targetType === "event").map((r) => r.targetId);
  const specialistIds = rows.filter((r) => r.targetType === "specialist").map((r) => r.targetId);
  const postIds = rows.filter((r) => r.targetType === "post").map((r) => r.targetId);
  const [events, users, posts] = await Promise.all([
    eventIds.length
      ? db.smmEvent.findMany({ where: { id: { in: eventIds } }, include: eventInclude })
      : Promise.resolve([]),
    specialistIds.length
      ? db.user.findMany({
          where: { id: { in: specialistIds } },
          select: { id: true, name: true, image: true, smmRating: true, smmRoles: { where: { ownerId: { not: null } }, select: { id: true, name: true, pricePerK: true, pricePerDay: true, createdAt: true } } },
        })
      : Promise.resolve([]),
    postIds.length
      ? db.smmPost.findMany({
          where: { id: { in: postIds } },
          include: { role: { select: { id: true, name: true, pricePerK: true, pricePerDay: true } }, specialist: publicUser },
        })
      : Promise.resolve([]),
  ]);
  const evMap = new Map(events.map((e) => [e.id, { ...e, tests: [] }] as [string, any]));
  const spMap = new Map(
    users.map((u) => [u.id, { id: u.id, name: u.name, image: u.image, rating: u.smmRating, orders: 0, roles: u.smmRoles }] as [string, any])
  );
  const poMap = new Map(posts.map((p) => [p.id, p] as [string, any]));
  const items = rows.map((r) => ({
    id: r.id,
    targetType: r.targetType as "event" | "specialist" | "post",
    targetId: r.targetId,
    createdAt: r.createdAt,
    event: evMap.get(r.targetId) || null,
    specialist: spMap.get(r.targetId) || null,
    post: poMap.get(r.targetId) || null,
  }));
  return { items };
}

export async function addSmmBookmark(userId: string, targetType: string, targetId: string) {
  if (!["event", "specialist", "post"].includes(targetType)) throw ApiError.badRequest("Bad target");
  const row = await db.smmBookmark.upsert({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
    create: { userId, targetType, targetId },
    update: {},
  });
  return row;
}

export async function removeSmmBookmark(userId: string, targetType: string, targetId: string) {
  await db.smmBookmark.deleteMany({ where: { userId, targetType, targetId } });
  return { ok: true };
}

// ── CHATS (чат window) ──────────────────────────────────────────────────────

export async function listChats(userId: string) {
  const rows = await db.smmChat.findMany({
    where: {
      OR: [
        { kind: "group" },
        { kind: "direct", aId: userId },
        { kind: "direct", bId: userId },
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    include: { owner: publicUser },
  });
  // Last message per chat + the direct peer
  const ids = rows.map((r) => r.id);
  const lasts = ids.length
    ? await db.smmChatMessage.findMany({
        where: { scopeType: "chat", scopeId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: ids.length * 3,
        select: { scopeId: true, text: true, createdAt: true },
      })
    : [];
  const lastMap = new Map<string, string>();
  for (const m of lasts) if (!lastMap.has(m.scopeId)) lastMap.set(m.scopeId, m.text);
  const items = rows.map((c) => {
    const peerId = c.kind === "direct" ? (c.aId === userId ? c.bId : c.aId) : null;
    const peer = peerId ? null : null; // resolved below
    return { ...c, lastMessage: lastMap.get(c.id) || null, peer, peerId };
  });
  // resolve peers in one query
  const peerIds = items.map((i: any) => i.peerId).filter(Boolean) as string[];
  const peers = peerIds.length
    ? await db.user.findMany({ where: { id: { in: peerIds } }, select: { id: true, name: true, image: true } })
    : [];
  const peerMap = new Map(peers.map((p) => [p.id, p] as [string, any]));
  return {
    items: items.map((c: any) => ({
      id: c.id,
      kind: c.kind,
      title: c.kind === "direct" ? peerMap.get(c.peerId)?.name || "Диалог" : c.title || "Чат",
      ownerId: c.ownerId,
      lastMessageAt: c.lastMessageAt,
      lastMessage: c.lastMessage,
      peer: c.peerId ? peerMap.get(c.peerId) || null : null,
    })),
  };
}

export async function createChat(userId: string, title: string, peerId?: string) {
  // Direct dialog: find-or-create by the ordered pair (a<b) — used by the
  // «Чат» button on event/post/specialist cards.
  if (peerId && peerId !== userId) {
    const [a, b] = userId < peerId ? [userId, peerId] : [peerId, userId];
    const found = await db.smmChat.findFirst({ where: { kind: "direct", aId: a, bId: b } });
    if (found) return found;
    return db.smmChat.create({ data: { kind: "direct", aId: a, bId: b, title: "" } });
  }
  const t = title.trim();
  if (!t) throw ApiError.badRequest("Title required");
  return db.smmChat.create({ data: { kind: "group", title: t.slice(0, 120), ownerId: userId } });
}

export async function renameChat(userId: string, id: string, title: string) {
  const chat = await db.smmChat.findUnique({ where: { id } });
  if (!chat) throw ApiError.notFound("Chat not found");
  if (chat.ownerId !== userId) throw ApiError.forbidden("Not your chat");
  const t = title.trim();
  if (!t) throw ApiError.badRequest("Title required");
  return db.smmChat.update({ where: { id }, data: { title: t.slice(0, 120) } });
}

export async function deleteChat(userId: string, id: string) {
  const chat = await db.smmChat.findUnique({ where: { id } });
  if (!chat) throw ApiError.notFound("Chat not found");
  if (chat.ownerId !== userId) throw ApiError.forbidden("Not your chat");
  await db.smmChatMessage.deleteMany({ where: { scopeType: "chat", scopeId: id } });
  await db.smmChat.delete({ where: { id } });
  return { ok: true };
}

export async function listChatMessages(userId: string, chatId: string, after?: string) {
  const chat = await db.smmChat.findUnique({ where: { id: chatId } });
  if (!chat) throw ApiError.notFound("Chat not found");
  const messages = await db.smmChatMessage.findMany({
    where: {
      scopeType: "chat",
      scopeId: chatId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  return { messages };
}

export async function sendChatMessage(userId: string, chatId: string, text: string) {
  const chat = await db.smmChat.findUnique({ where: { id: chatId } });
  if (!chat) throw ApiError.notFound("Chat not found");
  const t = text.trim();
  if (!t) throw ApiError.badRequest("Empty message");
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const msg = await db.smmChatMessage.create({
    data: { scopeType: "chat", scopeId: chatId, userId, userName: me?.name || "?", text: t.slice(0, 4000), kind: "text" },
  });
  await db.smmChat.update({ where: { id: chatId }, data: { lastMessageAt: new Date() } });
  return msg;
}

// ── CARD CHAT («Чат» on every card — the test-card group-chat mechanic) ─────
// Everyone's chat about THIS card: messages live in SmmChatMessage with
// scopeType = "event" | "post" | "specialist" and scopeId = the card id —
// the same per-subject scope contract the schema was designed around.

const CARD_SCOPES = ["event", "post", "specialist"] as const;

async function assertCardScope(scopeType: string, scopeId: string) {
  if (!(CARD_SCOPES as readonly string[]).includes(scopeType)) throw ApiError.badRequest("Bad scope");
  if (scopeType === "event") {
    const e = await db.smmEvent.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!e) throw ApiError.notFound("Event not found");
  } else if (scopeType === "post") {
    const p = await db.smmPost.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!p) throw ApiError.notFound("Post not found");
  } else {
    const u = await db.user.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!u) throw ApiError.notFound("User not found");
  }
}

export async function listCardChat(userId: string, scopeType: string, scopeId: string) {
  await assertCardScope(scopeType, scopeId);
  const messages = await db.smmChatMessage.findMany({
    where: { scopeType, scopeId },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  return { messages };
}

export async function sendCardChat(userId: string, scopeType: string, scopeId: string, text: string) {
  await assertCardScope(scopeType, scopeId);
  const t = text.trim();
  if (!t) throw ApiError.badRequest("Empty message");
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  return db.smmChatMessage.create({
    data: { scopeType, scopeId, userId, userName: me?.name || "?", text: t.slice(0, 4000), kind: "text" },
  });
}

// ── SPECIALIST CARD DELETE («Удалить» on the специалист card) ───────────────
// A specialist card IS the user's marketplace presence: deleting your own
// card removes your personal price-list roles (the ones without posts — a
// role with a post must be cleared via its post first) and drops the
// «specialist» flag, so the card leaves the публичная библиотека. Somebody
// else's card is refused — the same owner-guard the test deletes keep.
export async function deleteSpecialistCard(userId: string, id: string) {
  if (id !== userId) throw ApiError.forbidden("Not your card");
  const roles = await db.smmRole.findMany({
    where: { ownerId: userId },
    select: { id: true, name: true, _count: { select: { posts: true } } },
  });
  const withPosts = roles.filter((r) => r._count.posts > 0);
  if (withPosts.length > 0) {
    throw ApiError.badRequest("Remove the posts of these roles first: " + withPosts.map((r) => r.name).join(", "));
  }
  await db.smmRole.deleteMany({ where: { ownerId: userId } });
  await db.user.updateMany({ where: { id: userId, smmRole: "specialist" }, data: { smmRole: "customer" } });
  return { ok: true };
}
