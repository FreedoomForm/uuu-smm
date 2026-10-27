// POST /api/auth/logout — destroy the server-side session and clear the
// cookie. Idempotent: a missing/expired session still clears the device
// cookie so the next visit pre-renders the login screen.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { destroySession, clearedSessionCookie } from "@/server/auth/session";

export const POST = withApi(async ({ req }) => {
  await destroySession(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(clearedSessionCookie());
  return res;
});
