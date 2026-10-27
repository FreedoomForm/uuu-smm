// POST /api/auth/login — verify credentials and return the session user.
// Rate-limited per IP+email (dub's login policy); legacy unsalted-sha256
// accounts transparently upgrade to bcrypt on this path.
// On success a server-side session row is created and its opaque token is
// set as an httpOnly cookie — the device never stores any user field.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { assertRateLimit, RATELIMIT_POLICIES } from "@/server/http/rate-limit";
import { parseBody } from "@/server/http/validation";
import { loginSchema } from "@/server/schemas";
import { loginUser } from "@/server/services/auth.service";
import { createSession, sessionCookie } from "@/server/auth/session";

export const POST = withApi(async ({ req, ip }) => {
  const body = await parseBody(req, loginSchema);
  await assertRateLimit({
    policy: RATELIMIT_POLICIES.login,
    identifier: [ip, body.email],
  });
  const user = await loginUser(body);
  const token = await createSession(user.id);
  const res = NextResponse.json(user);
  res.cookies.set(sessionCookie(token));
  return res;
});
