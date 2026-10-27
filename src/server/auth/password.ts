// ---------------------------------------------------------------------------
// Password hashing — the professional standard every serious open-source
// backend uses (cal.com, documenso, next-auth ecosystems): bcrypt with
// per-password salt.
//
// The previous implementation stored bare SHA-256 digests (no salt, GPU-
// trivially brute-forceable). This module keeps those accounts working and
// transparently UPGRADES them to bcrypt on the next successful login (the
// same migration pattern cal.com used when it moved hash formats):
//
//   register           → bcrypt (cost 10)
//   login              → verify bcrypt; legacy sha256 accepted once and
//                        re-hashed into bcrypt by the caller
// ---------------------------------------------------------------------------

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "crypto";

const BCRYPT_COST = 10;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_COST);
}

export type VerifyResult = {
  ok: boolean;
  /** Set when a legacy sha256 password matched — the caller MUST persist
   *  this bcrypt hash so the account silently migrates off sha256. */
  upgradeTo?: string;
};

export function verifyPassword(
  password: string,
  storedHash: string
): VerifyResult {
  // bcrypt hashes start with the algorithm marker ($2a/$2b/$2y)
  if (storedHash.startsWith("$2")) {
    return { ok: bcrypt.compareSync(password, storedHash) };
  }

  // Legacy unsalted sha256 — verify in constant time, offer an upgrade
  const legacy = createHash("sha256").update(password).digest("hex");
  const a = Buffer.from(legacy);
  const b = Buffer.from(storedHash);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? { ok, upgradeTo: hashPassword(password) } : { ok: false };
}
