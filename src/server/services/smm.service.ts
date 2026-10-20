// ---------------------------------------------------------------------------
// SMM service — the marketplace domain: specialists (анкета), events
// (мероприятия) with their roles (ТЗ templates), invitations (customer →
// specialist), applications (specialist → event), personal-library
// bookmarks, files and the per-entity group chats.
//
// Access rules:
//   * events belong to their customer — only the owner edits roles/status;
//   * an ACCEPTED invitation or application makes the event "have" the
//     specialist for that role (derived, no extra table);
//   * the feed is role-aware: a customer browses SPECIALISTS, a specialist
//     browses EVENTS.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { ApiError } from "@/server/http/errors";
import { aiChat } from "@/lib/ai";

// ------------------------------------------------------------- profile (SMM) --

export async function getSmmProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, image: true,
      smmRole: true, smmHeadline: true, smmResume: true,
      smmVideoUrl: true, smmCity: true, smmRate: true, smmReady: true,
    },
  });
  if (!user) throw ApiError.notFound("User not found");
  return user;
}

export async function updateSmmProfile(
  userId: string,
  body: {
    smmRole?: string; smmHeadline?: string; smmResume?: string;
    smmVideoUrl?: string | null; smmCity?: string; smmRate?: string; smmReady?: boolean;
  }
) {
  const data: Record<string, unknown> = {};
  if (body.smmRole) data.smmRole = body.smmRole;
  if (typeof body.smmHeadline === "string") data.smmHeadline = body.smmHeadline.slice(0, 120);
  if (typeof body.smmResume === "string") data.smmResume = body.smmResume.slice(0, 8000);
  if (body.smmVideoUrl !== undefined) data.smmVideoUrl = body.smmVideoUrl ? String(body.smmVideoUrl).slice(0, 11_000_000) : null;
  if (typeof body.smmCity === "string") data.smmCity = body.smmCity.slice(0, 60);
  if (typeof body.smmRate === "string") data.smmRate = body.smmRate.slice(0, 120);
  if (typeof body.smmReady === "boolean") data.smmReady = body.smmReady;
  if (Object.keys(data).length === 0) throw ApiError.badRequest("Nothing to update");
  return db.user.update({
    where: { id: userId },
    data,
    select: {
      id: true, smmRole: true, smmHeadline: true, smmResume: true,
      smmVideoUrl: true, smmCity: true, smmRate: true, smmReady: true,
    },
  });
}

// ---------------------------------------------------------------- feed --

const SPECIALIST_SELECT = {
  id: true, name: true, image: true,
  smmRole: true, smmHeadline: true, smmResume: true,
  smmVideoUrl: true, smmCity: true, smmRate: true, smmReady: true,
  createdAt: true,
} as const;

function specialistPayload(u: Record<string, unknown> & { id: string }, filesCount: number) {
  return {
    id: u.id, name: u.name, image: u.image,
    headline: u.smmHeadline, resume: u.smmResume, videoUrl: u.smmVideoUrl,
    city: u.smmCity, rate: u.smmRate, ready: u.smmReady,
    smmRole: u.smmRole, filesCount, createdAt: u.createdAt,
  };
}

/** The dashboard feed, role-aware. scope "mine" = the personal library
 * (bookmarked specialists / bookmarked events), "discover" = everything.
 * kindOverride "events" lets a CUSTOMER browse events too (the customer's
 * «Мероприятия» page): mine = own + pinned events, discover = public open. */
export async function getSmmFeed(
  userId: string,
  scope: "mine" | "discover",
  limit = 12,
  kindOverride?: "events" | "specialists" | null,
) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { smmRole: true } });
  if (!me) throw ApiError.unauthorized("Not authenticated");

  const wantsEvents = kindOverride === "events" || (!kindOverride && me.smmRole === "specialist");

  if (wantsEvents) {
    // Events feed — the specialist's dashboard AND the customer's
    // «Мероприятия» page. Personal scope = the customer's OWN events plus
    // the pinned ones; discover = every PUBLIC OPEN event (the general
    // events library — the same rule the tests' community library uses).
    const bm = await db.smmBookmark.findMany({
      where: { userId, targetType: "event" },
      select: { targetId: true },
    });
    const pinnedIds = bm.map(b => b.targetId);
    const events = await db.smmEvent.findMany({
      where: scope === "mine"
        // Personal library: the customer's OWN events + the pinned ones.
        // (For a specialist the OR-branch never matches — they own no events.)
        ? { OR: [{ customerId: userId }, { id: { in: pinnedIds } }] }
        : { isPublic: true, status: "open" },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 50),
      select: {
        id: true, title: true, summary: true, brief: true, deadline: true,
        budget: true, restrictions: true, kind: true, coverColor: true,
        coverIcon: true, status: true, isPublic: true, createdAt: true, customerId: true,
        customer: { select: { id: true, name: true, image: true } },
        roles: { orderBy: { orderNum: "asc" }, select: { id: true, name: true, brief: true, payment: true, deadline: true } },
        _count: { select: { applications: { where: { status: "pending" } } } },
      },
    });
    const [fileCounts, others] = await Promise.all([
      db.smmFile.groupBy({
        by: ["ownerId"],
        where: { ownerType: "event", ownerId: { in: events.map(e => e.id) } },
        _count: { _all: true },
      }),
      // «Какие ещё мероприятия у этого заказчика есть» — публичные события
      // создателей этой ленты (бриф: специалист видит, кто создал мероприятие
      // и что ещё у него открыто). Соседей ленты НЕ исключаем — каждое событие
      // показывает портфель мероприятий своего заказчика.
      customerOtherEvents([...new Set(events.map(e => e.customerId))], []),
    ]);
    const fcMap = new Map(fileCounts.map(f => [f.ownerId, f._count._all]));
    return {
      kind: "events" as const,
      items: events.map(e => ({
        ...e,
        filesCount: fcMap.get(e.id) || 0,
        applicationsCount: e._count.applications,
        pendingApplications: e._count.applications,
        customerOtherEvents: others.get(e.customerId) || [],
        _count: undefined,
      })),
    };
  }

  // Customer browses SPECIALISTS (the dashboard feed; the customer's own
  // events feed lives on the «Мероприятия» page — kind=events override)
  const bm = await db.smmBookmark.findMany({
    where: { userId, targetType: "specialist" },
    select: { targetId: true },
  });
  const pinnedIds = bm.map(b => b.targetId);
  const specialists = await db.user.findMany({
    where: scope === "mine"
      ? { id: { in: pinnedIds }, smmRole: "specialist" }
      : { smmRole: "specialist" },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    select: SPECIALIST_SELECT,
  });
  const fileCounts = await db.smmFile.groupBy({
    by: ["ownerId"],
    where: { ownerType: "user", ownerId: { in: specialists.map(s => s.id) } },
    _count: { _all: true },
  });
  const fcMap = new Map(fileCounts.map(f => [f.ownerId, f._count._all]));
  return {
    kind: "specialists" as const,
    items: specialists.map(s => specialistPayload(s as unknown as Record<string, unknown> & { id: string }, fcMap.get(s.id) || 0)),
  };
}

// -------------------------------------------------------------- events CRUD --

const EVENT_ROLES_SELECT = {
  id: true, name: true, brief: true, payment: true, deadline: true, orderNum: true,
} as const;

// Per customer: their other PUBLIC OPEN events (max 5) — the specialist sees
// who created the event AND what else that customer runs (brief requirement).
type OtherEvent = { id: string; title: string; summary: string | null; kind: string | null; rolesCount: number };
async function customerOtherEvents(customerIds: string[], excludeIds: string[]) {
  const map = new Map<string, OtherEvent[]>();
  if (!customerIds.length) return map;
  const rows = await db.smmEvent.findMany({
    where: { customerId: { in: customerIds }, isPublic: true, status: "open", id: { notIn: excludeIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, summary: true, kind: true, customerId: true, _count: { select: { roles: true } } },
  });
  for (const r of rows) {
    const list = map.get(r.customerId) || [];
    if (list.length < 5) list.push({ id: r.id, title: r.title, summary: r.summary, kind: r.kind, rolesCount: r._count.roles });
    map.set(r.customerId, list);
  }
  return map;
}

export async function listMyEvents(userId: string) {
  const events = await db.smmEvent.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      roles: { orderBy: { orderNum: "asc" }, select: EVENT_ROLES_SELECT },
      _count: { select: { applications: { where: { status: "pending" } }, invitations: true } },
    },
  });
  return events.map(e => ({
    ...e,
    pendingApplications: e._count.applications,
    invitationsCount: e._count.invitations,
    _count: undefined,
  }));
}

async function assertEventOwner(eventId: string, userId: string) {
  const ev = await db.smmEvent.findUnique({ where: { id: eventId }, select: { customerId: true } });
  if (!ev) throw ApiError.notFound("Event not found");
  if (ev.customerId !== userId) throw ApiError.forbidden("Not your event");
  return ev;
}

export async function getEventDetail(eventId: string, userId?: string) {
  const ev = await db.smmEvent.findUnique({
    where: { id: eventId },
    include: {
      customer: { select: { id: true, name: true, image: true } },
      roles: {
        orderBy: { orderNum: "asc" },
        select: { ...EVENT_ROLES_SELECT },
      },
    },
  });
  if (!ev) throw ApiError.notFound("Event not found");
  // Assignments = accepted invitations + accepted applications, per role
  const [inv, apps] = await Promise.all([
    db.smmInvitation.findMany({
      where: { eventId, status: "accepted" },
      select: { roleId: true, specialist: { select: { id: true, name: true, image: true } }, message: true, updatedAt: true },
    }),
    db.smmApplication.findMany({
      where: { eventId, status: "accepted" },
      select: { roleId: true, specialist: { select: { id: true, name: true, image: true } }, message: true, updatedAt: true },
    }),
  ]);
  const assigned = new Map<string, { userId: string; name: string; image: string | null; source: string }[]>();
  for (const r of [...inv, ...apps]) {
    const list = assigned.get(r.roleId) || [];
    if (!list.some(x => x.userId === r.specialist.id)) {
      list.push({ userId: r.specialist.id, name: r.specialist.name, image: r.specialist.image, source: "accepted" });
    }
    assigned.set(r.roleId, list);
  }
  const [files, others] = await Promise.all([
    db.smmFile.findMany({
      where: { ownerType: "event", ownerId: eventId },
      orderBy: { orderNum: "asc" },
      select: { id: true, title: true, type: true, url: true, size: true, tgMessageId: true, orderNum: true, createdAt: true },
    }),
    customerOtherEvents([ev.customerId], [eventId]),
  ]);
  const isOwner = !!userId && userId === ev.customerId;
  return {
    ...ev,
    isOwner,
    files,
    customerOtherEvents: others.get(ev.customerId) || [],
    roles: ev.roles.map(r => ({ ...r, assigned: assigned.get(r.id) || [] })),
  };
}

export async function createEvent(userId: string, body: any) {
  const { roles, ...rest } = body;
  return db.smmEvent.create({
    data: {
      ...rest,
      customerId: userId,
      roles: roles?.length
        ? { create: roles.map((r: any, i: number) => ({ name: r.name, brief: r.brief || "", payment: r.payment || "", deadline: r.deadline || "", orderNum: i }))}
        : undefined,
    },
    include: { roles: { orderBy: { orderNum: "asc" } } },
  });
}

export async function updateEvent(eventId: string, userId: string, body: any) {
  await assertEventOwner(eventId, userId);
  const { roles, ...rest } = body;
  return db.smmEvent.update({ where: { id: eventId }, data: rest, include: { roles: { orderBy: { orderNum: "asc" } } } });
}

export async function deleteEvent(eventId: string, userId: string) {
  await assertEventOwner(eventId, userId);
  // Best-effort Telegram cleanup for the event's files
  const files = await db.smmFile.findMany({ where: { ownerType: "event", ownerId: eventId }, select: { url: true, tgMessageId: true } });
  await db.smmEvent.delete({ where: { id: eventId } });
  return { removedFiles: files.length };
}

// ------------------------------------------------------------- sharing --

/** Share an event — the exact analogue of shareTest:
 *   scope "link"      → copy-through (the link opens the event for anyone);
 *   scope "community" → OWNER-ONLY flip of isPublic — the event joins or
 *                       leaves the general events library (the discover feed). */
export async function shareEvent(userId: string, eventId: string, body: { scope?: "link" | "community" }) {
  const scope = body.scope || "link";
  const ev = await db.smmEvent.findUnique({
    where: { id: eventId },
    select: { id: true, customerId: true, isPublic: true },
  });
  if (!ev) throw ApiError.notFound("Event not found");
  if (scope === "community") {
    await assertEventOwner(eventId, userId);
    const next = !ev.isPublic;
    await db.smmEvent.update({ where: { id: eventId }, data: { isPublic: next } });
    return { ok: true, isPublic: next };
  }
  // link — no ownership requirement (any viewer can copy the direct link)
  return { ok: true, isPublic: ev.isPublic };
}

// ----------------------------------------------------------------- roles --

export async function addRole(eventId: string, userId: string, body: { name: string; brief?: string; payment?: string; deadline?: string }) {
  await assertEventOwner(eventId, userId);
  const count = await db.smmRole.count({ where: { eventId } });
  return db.smmRole.create({
    data: { ...body, brief: body.brief || "", payment: body.payment || "", deadline: body.deadline || "", eventId, orderNum: count },
  });
}

async function assertRoleOwner(roleId: string, userId: string) {
  const role = await db.smmRole.findUnique({ where: { id: roleId }, select: { event: { select: { customerId: true } }, authorId: true } });
  if (!role) throw ApiError.notFound("Role not found");
  // Both the event's owner (an event role) and the template's author
  // (a public «Общие роли» template) may manage the role.
  const isEventOwner = !!role.event && role.event.customerId === userId;
  const isAuthor = role.authorId === userId;
  if (!isEventOwner && !isAuthor) throw ApiError.forbidden("Not your role");
}

export async function updateRole(roleId: string, userId: string, body: any) {
  await assertRoleOwner(roleId, userId);
  return db.smmRole.update({ where: { id: roleId }, data: body });
}

export async function deleteRole(roleId: string, userId: string) {
  await assertRoleOwner(roleId, userId);
  await db.smmRole.delete({ where: { id: roleId } });
  return { ok: true };
}

// ── ОБЩИЕ РОЛИ — public task templates. box=mine → my event roles + my
// templates; box=public → every isPublic template (the sharing library).
export async function listRoles(userId: string, box: "mine" | "public") {
  if (box === "public") {
    const roles = await db.smmRole.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: { select: { id: true, name: true, image: true } },
        event: { select: { id: true, title: true, kind: true } },
      },
    });
    return roles;
  }
  // mine: every role of MY events + my standalone templates
  const roles = await db.smmRole.findMany({
    where: { OR: [{ event: { customerId: userId } }, { authorId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      author: { select: { id: true, name: true, image: true } },
      event: { select: { id: true, title: true, kind: true } },
      _count: { select: { applications: { where: { status: "pending" } }, invitations: { where: { status: "pending" } } } },
    },
  });
  return roles.map((r: any) => ({
    ...r,
    pendingApplications: r._count?.applications || 0,
    pendingInvitations: r._count?.invitations || 0,
    _count: undefined,
  }));
}

/** Publish / unpublish MY role as a public template, or create a standalone
 * public template («Общие роли» — people share task templates for roles). */
export async function createRoleTemplate(userId: string, body: { name: string; brief?: string; payment?: string; deadline?: string; isPublic?: boolean }) {
  if (!body.name?.trim()) throw ApiError.badRequest("Name is required");
  return db.smmRole.create({
    data: {
      name: body.name, brief: body.brief || "", payment: body.payment || "",
      deadline: body.deadline || "", isPublic: body.isPublic !== false,
      authorId: userId, orderNum: 0,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });
}

/** Attach a public template into one of MY events — copies the template text
 * into a fresh role of the event (the template itself stays shared). */
export async function attachRoleTemplate(roleId: string, userId: string, body: { eventId: string }) {
  await assertEventOwner(body.eventId, userId);
  const tpl = await db.smmRole.findUnique({ where: { id: roleId }, select: { name: true, brief: true, payment: true, deadline: true, isPublic: true, authorId: true, event: { select: { customerId: true } } } });
  if (!tpl) throw ApiError.notFound("Role not found");
  if (!tpl.isPublic && tpl.authorId !== userId && tpl.event?.customerId !== userId) throw ApiError.forbidden("Not a public template");
  const count = await db.smmRole.count({ where: { eventId: body.eventId } });
  return db.smmRole.create({
    data: { name: tpl.name, brief: tpl.brief, payment: tpl.payment, deadline: tpl.deadline, eventId: body.eventId, orderNum: count },
  });
}

// ------------------------------------------------------------ invitations --

export async function createInvitation(userId: string, body: { eventId: string; roleId: string; specialistId: string; message?: string }) {
  await assertEventOwner(body.eventId, userId);
  const role = await db.smmRole.findUnique({ where: { id: body.roleId }, select: { eventId: true } });
  if (!role || role.eventId !== body.eventId) throw ApiError.badRequest("Role does not belong to the event");
  const specialist = await db.user.findUnique({ where: { id: body.specialistId }, select: { smmRole: true } });
  if (!specialist) throw ApiError.notFound("Specialist not found");
  if (specialist.smmRole !== "specialist") throw ApiError.badRequest("User is not an SMM specialist");
  if (body.specialistId === userId) throw ApiError.badRequest("Cannot invite yourself");
  // Idempotent re-invite: refresh the pending one instead of stacking rows
  const existing = await db.smmInvitation.findFirst({
    where: { eventId: body.eventId, roleId: body.roleId, specialistId: body.specialistId, status: "pending" },
  });
  if (existing) {
    return db.smmInvitation.update({ where: { id: existing.id }, data: { message: body.message || "" } });
  }
  return db.smmInvitation.create({
    data: {
      eventId: body.eventId, roleId: body.roleId, customerId: userId,
      specialistId: body.specialistId, message: body.message || "",
    },
    include: {
      event: { select: { id: true, title: true } },
      role: { select: { id: true, name: true } },
      specialist: { select: { id: true, name: true, image: true } },
    },
  });
}

export async function listInvitations(userId: string, box: "sent" | "inbox") {
  const where = box === "sent" ? { customerId: userId } : { specialistId: userId };
  return db.smmInvitation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      event: { select: { id: true, title: true, summary: true, budget: true, deadline: true } },
      role: { select: { id: true, name: true, brief: true, payment: true, deadline: true } },
      customer: { select: { id: true, name: true, image: true } },
      specialist: { select: { id: true, name: true, image: true } },
    },
  });
}

export async function respondInvitation(id: string, userId: string, action: "accept" | "decline") {
  const inv = await db.smmInvitation.findUnique({ where: { id }, select: { specialistId: true, status: true } });
  if (!inv) throw ApiError.notFound("Invitation not found");
  if (inv.specialistId !== userId) throw ApiError.forbidden("Not your invitation");
  if (inv.status !== "pending") throw ApiError.badRequest("Already responded");
  return db.smmInvitation.update({ where: { id }, data: { status: action === "accept" ? "accepted" : "declined" } });
}

// ----------------------------------------------------------- applications --

export async function createApplication(userId: string, body: { eventId: string; roleId: string; message?: string; requestId?: string }) {
  const ev = await db.smmEvent.findUnique({ where: { id: body.eventId }, select: { isPublic: true, status: true, customerId: true } });
  if (!ev) throw ApiError.notFound("Event not found");
  if (!ev.isPublic || ev.status !== "open") throw ApiError.badRequest("Event is not accepting applications");
  if (ev.customerId === userId) throw ApiError.badRequest("Cannot apply to your own event");
  const role = await db.smmRole.findUnique({ where: { id: body.roleId }, select: { eventId: true } });
  if (!role || role.eventId !== body.eventId) throw ApiError.badRequest("Role does not belong to the event");
  // The structured запрос must belong to the sender
  if (body.requestId) {
    const req = await db.smmRequest.findUnique({ where: { id: body.requestId }, select: { specialistId: true } });
    if (!req || req.specialistId !== userId) throw ApiError.forbidden("Not your запрос");
  }
  const existing = await db.smmApplication.findFirst({
    where: { eventId: body.eventId, roleId: body.roleId, specialistId: userId, status: "pending" },
  });
  if (existing) {
    return db.smmApplication.update({ where: { id: existing.id }, data: { message: body.message || "", requestId: body.requestId || null } });
  }
  return db.smmApplication.create({
    data: {
      eventId: body.eventId, roleId: body.roleId, specialistId: userId, message: body.message || "",
      requestId: body.requestId || null,
    },
    include: {
      event: { select: { id: true, title: true } },
      role: { select: { id: true, name: true } },
      specialist: { select: { id: true, name: true, image: true } },
      request: { select: { id: true, title: true } },
    },
  });
}

export async function listApplications(userId: string, box: "inbox" | "sent") {
  // inbox = applications to MY events (the customer reviews them);
  // sent = my own applications (the specialist tracks statuses)
  const where = box === "inbox" ? { event: { customerId: userId } } : { specialistId: userId };
  return db.smmApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      event: { select: { id: true, title: true, summary: true, budget: true, deadline: true } },
      role: { select: { id: true, name: true, brief: true, payment: true, deadline: true } },
      specialist: { select: { id: true, name: true, image: true } },
      request: { select: { id: true, title: true, summary: true, steps: { orderBy: { orderNum: "asc" }, select: { id: true, title: true, hint: true, answer: true, orderNum: true } } } },
    },
  });
}

export async function respondApplication(id: string, userId: string, action: "accept" | "decline") {
  const app = await db.smmApplication.findUnique({
    where: { id },
    select: { status: true, event: { select: { customerId: true } } },
  });
  if (!app) throw ApiError.notFound("Application not found");
  if (app.event.customerId !== userId) throw ApiError.forbidden("Not your event");
  if (app.status !== "pending") throw ApiError.badRequest("Already responded");
  return db.smmApplication.update({ where: { id }, data: { status: action === "accept" ? "accepted" : "declined" } });
}

// -------------------------------------------------------------- bookmarks --

export async function listSmmBookmarks(userId: string, targetType?: "specialist" | "event" | "request" | "role") {
  const rows = await db.smmBookmark.findMany({
    where: { userId, ...(targetType ? { targetType } : {}) },
    select: { targetType: true, targetId: true },
  });
  return { ids: rows.map(r => r.targetId), pairs: rows };
}

export async function addSmmBookmark(userId: string, targetType: "specialist" | "event" | "request" | "role", targetId: string) {
  // Validate the target exists
  if (targetType === "specialist") {
    const u = await db.user.findUnique({ where: { id: targetId }, select: { smmRole: true } });
    if (!u || u.smmRole !== "specialist") throw ApiError.notFound("Specialist not found");
  } else if (targetType === "event") {
    const ev = await db.smmEvent.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!ev) throw ApiError.notFound("Event not found");
  } else if (targetType === "request") {
    const r = await db.smmRequest.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!r) throw ApiError.notFound("Request not found");
  } else {
    const r = await db.smmRole.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!r) throw ApiError.notFound("Role not found");
  }
  await db.smmBookmark.upsert({
    where: { userId_targetType_targetId: { userId, targetType, targetId } },
    create: { userId, targetType, targetId },
    update: {},
  });
  return { ok: true };
}

export async function removeSmmBookmark(userId: string, targetType: "specialist" | "event" | "request" | "role", targetId: string) {
  await db.smmBookmark.deleteMany({ where: { userId, targetType, targetId } });
  return { ok: true };
}

// ------------------------------------------------------------------ files --

export async function listSmmFiles(ownerType: "user" | "event", ownerId: string) {
  return db.smmFile.findMany({
    where: { ownerType, ownerId },
    orderBy: { orderNum: "asc" },
    select: { id: true, title: true, type: true, url: true, size: true, tgMessageId: true, orderNum: true, createdAt: true },
  });
}

export async function addSmmFile(userId: string, body: { ownerType: "user" | "event"; ownerId: string; title?: string; type?: string; url: string; size?: number | null; tgMessageId?: number | null }) {
  if (body.ownerType === "event") await assertEventOwner(body.ownerId, userId);
  else if (body.ownerId !== userId) throw ApiError.forbidden("Not your profile");
  const count = await db.smmFile.count({ where: { ownerType: body.ownerType, ownerId: body.ownerId } });
  return db.smmFile.create({
    data: {
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      title: (body.title || "file").slice(0, 200),
      type: (body.type || "link").slice(0, 20),
      url: body.url,
      size: body.size ?? null,
      tgMessageId: body.tgMessageId ?? null,
      orderNum: count,
    },
  });
}

export async function deleteSmmFile(id: string, userId: string) {
  const f = await db.smmFile.findUnique({ where: { id } });
  if (!f) throw ApiError.notFound("File not found");
  if (f.ownerType === "event") await assertEventOwner(f.ownerId, userId);
  else if (f.ownerId !== userId) throw ApiError.forbidden("Not your file");
  await db.smmFile.delete({ where: { id } });
  return { ok: true, tgMessageId: f.tgMessageId, url: f.url };
}

// ------------------------------------------------------------------- chat --

export async function getSmmMessages(scopeType: "event" | "specialist", scopeId: string, after?: string) {
  if (scopeType === "event") {
    const ev = await db.smmEvent.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!ev) throw ApiError.notFound("Event not found");
  } else {
    const u = await db.user.findUnique({ where: { id: scopeId }, select: { id: true } });
    if (!u) throw ApiError.notFound("Specialist not found");
  }
  const rows = await db.smmChatMessage.findMany({
    where: { scopeType, scopeId, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, scopeType: true, scopeId: true, userId: true, userName: true, text: true, createdAt: true },
  });
  return rows;
}

export async function sendSmmMessage(scopeType: "event" | "specialist", scopeId: string, userId: string, text: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  if (!user) throw ApiError.unauthorized("Not authenticated");
  await getSmmMessages(scopeType, scopeId); // validates the scope exists
  return db.smmChatMessage.create({
    data: { scopeType, scopeId, userId, userName: user.name, text: text.slice(0, 2000) },
    select: { id: true, scopeType: true, scopeId: true, userId: true, userName: true, text: true, createdAt: true },
  });
}

// --------------------------------------------------------------------- AI --

/** AI chat about a SPECIALIST — the customer learns about the person from
 * their анкета: headline, resume, city/rate, attached files. The same
 * provider chain as the rest of the app (Z.ai GLM first). */
export async function chatAboutSpecialist(specialistId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const u = await db.user.findUnique({
    where: { id: specialistId },
    select: {
      name: true, smmRole: true, smmHeadline: true, smmResume: true,
      smmCity: true, smmRate: true, smmReady: true,
    },
  });
  if (!u || u.smmRole !== "specialist") throw ApiError.notFound("Specialist not found");
  const files = await db.smmFile.findMany({
    where: { ownerType: "user", ownerId: specialistId },
    orderBy: { orderNum: "asc" },
    take: 30,
    select: { title: true, type: true },
  });

  const facts: string[] = [
    `Имя специалиста: ${u.name}`,
    u.smmHeadline ? `Специализация: ${u.smmHeadline}` : "",
    u.smmCity ? `Город: ${u.smmCity}` : "",
    u.smmRate ? `Ставка/оплата: ${u.smmRate}` : "",
    `Открыт к работе: ${u.smmReady ? "да" : "нет"}`,
    u.smmResume ? `Резюме:\n${u.smmResume.slice(0, 4000)}` : "",
    files.length ? `Прикреплённые файлы (${files.length}): ${files.map(f => `${f.title} [${f.type}]`).join(", ")}` : "Файлов не прикреплено.",
  ].filter(Boolean);

  const system = [
    "Ты — помощник заказчика, который оценивает SMM-специалиста для найма.",
    "Отвечай на языке последнего сообщения пользователя. Будь конкретным, опирайся ТОЛЬКО на данные анкеты ниже; если данных не хватает — честно скажи, что уточнить у специалиста.",
    "Помоги заказчику понять: сильные стороны, релевантный опыт, вопросы, которые стоит задать на интервью, и соответствие задаче заказчика.",
    "",
    "ДАННЫЕ АНКЕТЫ:",
    ...facts,
  ].join("\n");

  const { text } = await aiChat({
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 1200,
  });
  return { response: text };
}

/** AI chat about an EVENT — the «ИИ чат» card button: the specialist (or the
 * customer) discusses the event's brief, roles, payment and deadlines with
 * the tutor. The same provider chain as the rest of the app. */
export async function chatAboutEvent(eventId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const ev = await db.smmEvent.findUnique({
    where: { id: eventId },
    select: {
      title: true, summary: true, brief: true, deadline: true, budget: true,
      restrictions: true, kind: true, status: true, isPublic: true,
      customer: { select: { name: true } },
      roles: { orderBy: { orderNum: "asc" }, select: { name: true, brief: true, payment: true, deadline: true } },
    },
  });
  if (!ev) throw ApiError.notFound("Event not found");

  const facts: string[] = [
    `Мероприятие: ${ev.title}`,
    ev.customer?.name ? `Заказчик: ${ev.customer.name}` : "",
    `Тип: ${ev.kind === "government" ? "государство" : "бизнес"}`,
    `Статус: ${ev.status === "open" ? "открыто" : "закрыто"}`,
    ev.summary ? `Краткое описание: ${ev.summary}` : "",
    ev.brief ? `Полное ТЗ:\n${ev.brief.slice(0, 4000)}` : "",
    ev.deadline ? `Срок: ${ev.deadline}` : "",
    ev.budget ? `Оплата: ${ev.budget}` : "",
    ev.restrictions ? `Ограничения: ${ev.restrictions}` : "",
    ev.roles.length
      ? `Роли (${ev.roles.length}):\n${ev.roles.map(r => `- ${r.name}${r.payment ? ` · оплата: ${r.payment}` : ""}${r.deadline ? ` · срок: ${r.deadline}` : ""}${r.brief ? `\n  ТЗ: ${r.brief.slice(0, 800)}` : ""}`).join("\n")}`
      : "Ролей пока нет.",
  ].filter(Boolean);

  const system = [
    "Ты — помощник по SMM-мероприятиям. Пользователь изучает мероприятие и решает, откликнуться ли на него (или, если он заказчик, как его улучшить).",
    "Отвечай на языке последнего сообщения пользователя. Будь конкретным и опирайся ТОЛЬКО на данные мероприятия ниже; если данных не хватает — честно скажи, что уточнить у заказчика.",
    "",
    "ДАННЫЕ МЕРОПРИЯТИЯ:",
    ...facts,
  ].join("\n");

  const { text } = await aiChat({
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 1200,
  });
  return { response: text };
}

/** AI chat about a ЗАПРОС — the «ИИ чат» card button on the request cards:
 * the steps and their answers are the context. */
export async function chatAboutRequest(requestId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const rq = await db.smmRequest.findUnique({
    where: { id: requestId },
    select: {
      title: true, summary: true, isPublic: true,
      specialist: { select: { name: true, smmHeadline: true, smmCity: true, smmRate: true } },
      steps: { orderBy: { orderNum: "asc" }, select: { title: true, hint: true, answer: true } },
    },
  });
  if (!rq) throw ApiError.notFound("Request not found");

  const facts: string[] = [
    `Запрос: ${rq.title}`,
    rq.specialist?.name ? `SMM-специалист: ${rq.specialist.name}` : "",
    rq.specialist?.smmHeadline ? `Специализация: ${rq.specialist.smmHeadline}` : "",
    rq.summary ? `Описание: ${rq.summary}` : "",
    rq.steps.length
      ? `Шаги (${rq.steps.length}):\n${rq.steps.map((s, i) => `${i + 1}. ${s.title}${s.hint ? ` — ${s.hint}` : ""}${s.answer ? `\n   Ответ: ${s.answer.slice(0, 600)}` : " (не заполнен)"}`).join("\n")}`
      : "Шагов пока нет.",
  ].filter(Boolean);

  const system = [
    "Ты — помощник по SMM-запросам. Запрос — это структурированное предложение специалиста: шаги описывают этапы работы.",
    "Отвечай на языке последнего сообщения пользователя. Опирайся ТОЛЬКО на данные запроса ниже.",
    "",
    "ДАННЫЕ ЗАПРОСА:",
    ...facts,
  ].join("\n");

  const { text } = await aiChat({
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 1200,
  });
  return { response: text };
}

/** AI chat about a ROLE (ТЗ) — the «ИИ чат» card button on the roles pages:
 * event roles carry their event's context; public templates stand alone. */
export async function chatAboutRole(roleId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const role = await db.smmRole.findUnique({
    where: { id: roleId },
    select: {
      name: true, brief: true, payment: true, deadline: true, isPublic: true,
      event: { select: { title: true, summary: true, budget: true, deadline: true, customer: { select: { name: true } } } },
      author: { select: { name: true } },
    },
  });
  if (!role) throw ApiError.notFound("Role not found");

  const facts: string[] = [
    `Роль (ТЗ): ${role.name}`,
    role.author?.name ? `Автор шаблона: ${role.author.name}` : "",
    role.event ? `Мероприятие: ${role.event.title}${role.event.customer?.name ? ` (заказчик: ${role.event.customer.name})` : ""}` : "Публичный шаблон (без мероприятия)",
    role.brief ? `ТЗ роли:\n${role.brief.slice(0, 4000)}` : "",
    role.payment ? `Оплата: ${role.payment}` : "",
    role.deadline ? `Срок: ${role.deadline}` : "",
    role.event?.budget ? `Бюджет мероприятия: ${role.event.budget}` : "",
    role.event?.deadline ? `Срок мероприятия: ${role.event.deadline}` : "",
  ].filter(Boolean);

  const system = [
    "Ты — помощник по SMM-ролям. Роль — это ТЗ (постановка задачи) внутри мероприятия или публичный шаблон задач.",
    "Отвечай на языке последнего сообщения пользователя. Опирайся ТОЛЬКО на данные роли ниже.",
    "",
    "ДАННЫЕ РОЛИ:",
    ...facts,
  ].join("\n");

  const { text } = await aiChat({
    messages: [{ role: "system", content: system }, ...messages],
    temperature: 0.4,
    max_tokens: 1200,
  });
  return { response: text };
}

// ---------------------------------------------------------------- запросы --

const REQUEST_STEPS_SELECT = {
  id: true, title: true, hint: true, answer: true, orderNum: true,
} as const;

/** My запросы (box=mine) or the PUBLIC templates of all specialists
 * (box=public — «Публичная библиотека»: people share task templates). */
export async function listRequests(userId: string, box: "mine" | "public") {
  if (box === "public") {
    const rows = await db.smmRequest.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, specialistId: true, title: true, summary: true,
        coverColor: true, coverIcon: true, isPublic: true, createdAt: true,
        specialist: { select: { id: true, name: true, image: true } },
        steps: { orderBy: { orderNum: "asc" }, select: REQUEST_STEPS_SELECT },
        _count: { select: { steps: true } },
      },
    });
    return rows.map(r => ({ ...r, stepsCount: r._count.steps, _count: undefined, filledCount: r.steps.filter((s: any) => (s.answer || "").trim()).length }));
  }
  const rows = await db.smmRequest.findMany({
    where: { specialistId: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, specialistId: true, title: true, summary: true,
      coverColor: true, coverIcon: true, isPublic: true, createdAt: true,
      specialist: { select: { id: true, name: true, image: true } },
      steps: { orderBy: { orderNum: "asc" }, select: REQUEST_STEPS_SELECT },
      applications: { select: { id: true, status: true, event: { select: { id: true, title: true } }, role: { select: { id: true, name: true } }, createdAt: true } },
      _count: { select: { steps: true } },
    },
  });
  return rows.map(r => ({
    ...r,
    stepsCount: r._count.steps,
    _count: undefined,
    filledCount: r.steps.filter((s: any) => (s.answer || "").trim()).length,
  }));
}

export async function getRequest(id: string, userId: string) {
  const req = await db.smmRequest.findUnique({
    where: { id },
    select: {
      id: true, specialistId: true, title: true, summary: true, coverColor: true,
      coverIcon: true, isPublic: true, createdAt: true,
      specialist: { select: { id: true, name: true, image: true } },
      steps: { orderBy: { orderNum: "asc" }, select: REQUEST_STEPS_SELECT },
    },
  });
  if (!req) throw ApiError.notFound("Request not found");
  // Own always; foreign — only when public (the link/library rule)
  if (req.specialistId !== userId && !req.isPublic) throw ApiError.forbidden("Not your запрос");
  return { ...req, isOwner: req.specialistId === userId };
}

export async function createRequest(userId: string, body: {
  title?: string; summary?: string; coverColor?: string | null; coverIcon?: string | null;
  isPublic?: boolean; steps?: { title?: string; hint?: string; answer?: string }[];
}) {
  const me = await db.user.findUnique({ where: { id: userId }, select: { smmRole: true } });
  if (!me) throw ApiError.unauthorized("Not authenticated");
  if (!body.title?.trim()) throw ApiError.badRequest("Title is required");
  return db.smmRequest.create({
    data: {
      specialistId: userId,
      title: body.title.trim(),
      summary: body.summary || "",
      coverColor: body.coverColor || null,
      coverIcon: body.coverIcon || null,
      isPublic: !!body.isPublic,
      steps: {
        create: (body.steps || []).slice(0, 60).map((s, i) => ({
          title: (s.title || `Шаг ${i + 1}`).slice(0, 200),
          hint: s.hint || "",
          answer: s.answer || "",
          orderNum: i,
        })),
      },
    },
    include: { steps: { orderBy: { orderNum: "asc" }, select: REQUEST_STEPS_SELECT } },
  });
}

export async function updateRequest(id: string, userId: string, body: {
  title?: string; summary?: string; coverColor?: string | null; coverIcon?: string | null;
  isPublic?: boolean; steps?: { title?: string; hint?: string; answer?: string }[];
}) {
  const req = await db.smmRequest.findUnique({ where: { id }, select: { specialistId: true } });
  if (!req) throw ApiError.notFound("Request not found");
  if (req.specialistId !== userId) throw ApiError.forbidden("Not your запрос");
  const data: any = {};
  if (body.title !== undefined) data.title = body.title.trim();
  if (body.summary !== undefined) data.summary = body.summary;
  if (body.coverColor !== undefined) data.coverColor = body.coverColor;
  if (body.coverIcon !== undefined) data.coverIcon = body.coverIcon;
  if (body.isPublic !== undefined) data.isPublic = body.isPublic;
  if (body.steps !== undefined) {
    // Steps replace wholesale (the editor submits the full ordered list)
    data.steps = {
      deleteMany: {},
      create: (body.steps || []).slice(0, 60).map((s, i) => ({
        title: (s.title || `Шаг ${i + 1}`).slice(0, 200),
        hint: s.hint || "",
        answer: s.answer || "",
        orderNum: i,
      })),
    };
  }
  return db.smmRequest.update({
    where: { id },
    data,
    include: { steps: { orderBy: { orderNum: "asc" }, select: REQUEST_STEPS_SELECT } },
  });
}

export async function deleteRequest(id: string, userId: string) {
  const req = await db.smmRequest.findUnique({ where: { id }, select: { specialistId: true } });
  if (!req) throw ApiError.notFound("Request not found");
  if (req.specialistId !== userId) throw ApiError.forbidden("Not your запрос");
  await db.smmRequest.delete({ where: { id } });
  return { ok: true };
}

/** Share a запрос — the exact analogue of shareEvent/shareTest:
 *   scope "link"      → copy-through;
 *   scope "community" → OWNER-ONLY flip of isPublic (the public templates
 *                       library — «Публичная библиотека»). */
export async function shareRequest(userId: string, requestId: string, body: { scope?: "link" | "community" }) {
  const scope = body.scope || "link";
  const req = await db.smmRequest.findUnique({
    where: { id: requestId },
    select: { id: true, specialistId: true, isPublic: true },
  });
  if (!req) throw ApiError.notFound("Request not found");
  if (scope === "community") {
    if (req.specialistId !== userId) throw ApiError.forbidden("Not your запрос");
    const next = !req.isPublic;
    await db.smmRequest.update({ where: { id: requestId }, data: { isPublic: next } });
    return { ok: true, isPublic: next };
  }
  return { ok: true, isPublic: req.isPublic };
}
