// POST /api/auth/register — create an account (bcrypt-hashed password,
// rate-limited per IP+email against brute-force signup loops).
// On success a server-side session is created and its opaque token is set
// as an httpOnly cookie — the device never stores any user field.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { assertRateLimit, RATELIMIT_POLICIES } from "@/server/http/rate-limit";
import { parseBody } from "@/server/http/validation";
import { registerSchema } from "@/server/schemas";
import { registerUser } from "@/server/services/auth.service";
import { createSession, sessionCookie } from "@/server/auth/session";

export const POST = withApi(async ({ req, ip }) => {
  const body = await parseBody(req, registerSchema);
  await assertRateLimit({
    policy: RATELIMIT_POLICIES.register,
    identifier: [ip, body.email],
  });
  const user = await registerUser(body);
  const token = await createSession(user.id);
  const res = NextResponse.json(user, { status: 201 });
  res.cookies.set(sessionCookie(token));
  return res;
});
