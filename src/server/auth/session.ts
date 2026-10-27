// ---------------------------------------------------------------------------
// Server-side sessions — the device holds ONLY an opaque httpOnly cookie;
// every user field lives in the database (Session table). Replaces the old
// "user object in localStorage + spoofable x-user-id header" scheme.
//
//   * createSession(userId)  → new random token row (+180 days)
//   * sessionCookie(token)   → Set-Cookie cookie structure
//   * sessionUserId(req)     → cookie → DB lookup → userId | null
//   * destroySession(req)    → delete the row (logout)
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "uuu_session";
const SESSION_TTL_DAYS = 180;

/** Create a DB session row and return its opaque token. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(24).toString("hex"); // 48 chars
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { id: token, userId, expiresAt } });
  return token;
}

/** Set-Cookie structure for the session token (httpOnly — JS cannot read it). */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

/** Cookie structure that expires the session on the device. */
export function clearedSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

/**
 * Resolve the caller's userId from the session cookie. The lookup IS the
 * verification: only a live (unexpired) row backed by a real user resolves.
 * Expired rows are deleted lazily on sight.
 */
export async function sessionUserId(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || token.length < 32) return null;
  const session = await db.session.findUnique({
    where: { id: token },
    select: { userId: true, expiresAt: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    db.session.delete({ where: { id: token } }).catch(() => {});
    return null;
  }
  // Opportunistic purge of ALL expired rows (~2% of authenticated requests —
  // index-backed, keeps the table from growing unboundedly between deploys)
  if (Math.random() < 0.02) {
    db.session
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => {});
  }
  return session.userId;
}

/** Destroy the caller's session row (idempotent — missing row is fine). */
export async function destroySession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await db.session.deleteMany({ where: { id: token } }).catch(() => {});
}
