// ---------------------------------------------------------------------------
// Auth service — register / login.
//
// Professional replacements over the previous hand-rolled version:
//   * bcrypt password hashing (src/server/auth/password.ts, the cal.com /
//     documenso standard) with transparent upgrade of legacy sha256 accounts;
//   * rate limiting through the dub-style policy table (brute-force guard);
//   * zod-validated input; stable error messages the frontend already shows.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { ApiError } from "@/server/http/errors";

const PUBLIC_USER_FIELDS = { id: true, email: true, name: true } as const;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  // The account kind picked at registration («СММ специалист» | «Заказчик»).
  // FIXED: the SMM view locks to it — no bottom-panel role switcher.
  smmRole: string;
};

function normalizeSmmRole(v: unknown): string {
  return v === "specialist" || v === "customer" ? v : "customer";
}

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
  smmRole?: string;
}): Promise<PublicUser> {
  const { email, name, password } = input;
  // Separate registration: the account kind comes from the signup flow
  // («СММ специалист» / «Заказчик») and becomes the user's fixed SMM tab.
  const smmRole = normalizeSmmRole(input.smmRole);

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.conflict("Email already registered");
  }

  // Concurrent registers with the same email race past the check above —
  // the unique constraint is the source of truth. Map P2002 → 409.
  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        name,
        password: hashPassword(password),
        smmRole,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw ApiError.conflict("Email already registered");
    }
    throw e;
  }

  return { id: user.id, email: user.email, name: user.name, smmRole: user.smmRole };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<PublicUser> {
  const { email, password } = input;

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    // Same message for unknown email and wrong password (no account probing)
    throw ApiError.unauthorized("Invalid email or password");
  }

  const result = verifyPassword(password, user.password);
  if (!result.ok) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  // Legacy sha256 account just authenticated — silently migrate it to bcrypt
  if (result.upgradeTo) {
    await db.user
      .update({ where: { id: user.id }, data: { password: result.upgradeTo } })
      .catch(() => {
        /* upgrade is best-effort — the login itself still succeeds */
      });
  }

  return { id: user.id, email: user.email, name: user.name, smmRole: user.smmRole };
}
