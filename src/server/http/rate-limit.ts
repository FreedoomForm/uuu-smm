// ---------------------------------------------------------------------------
// Rate limiting — ported from dubinc/dub
// (apps/web/lib/upstash/assert-rate-limit.ts + ratelimit-policies.ts).
//
// dub enforces per-policy sliding-window limits through Upstash Redis. This
// port keeps the EXACT same interface and policy table, but the limiter runs
// on an in-process sliding window instead of Redis:
//   * serverless-safe (each warm lambda enforces its own window — on Vercel
//     the effective global budget is window × concurrent instances, which is
//     the standard no-Redis compromise);
//   * swapping in Upstash later is a one-file change (implement `limit()`
//     with @upstash/ratelimit — the call sites do not move).
// ---------------------------------------------------------------------------

import { ApiError } from "./errors";

// --------------------------------------------------------------- adapter ---

type SlidingWindowState = Map<string, number[]>;

const globalForLimiter = globalThis as unknown as {
  __uuuRateWindows: Map<string, SlidingWindowState> | undefined;
};

// Survive dev-server hot reloads like the Prisma singleton does
const windows: Map<string, SlidingWindowState> =
  globalForLimiter.__uuuRateWindows ?? new Map();
globalForLimiter.__uuuRateWindows = windows;

function parseWindowMs(window: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)$/.exec(window.trim());
  if (!m) return 60_000;
  const n = Number(m[1]);
  switch (m[2]) {
    case "ms":
      return n;
    case "s":
      return n * 1_000;
    case "m":
      return n * 60_000;
    case "h":
      return n * 3_600_000;
    case "d":
      return n * 86_400_000;
    default:
      return 60_000;
  }
}

/**
 * Sliding-window `limit()` — the same contract Upstash's Ratelimit exposes:
 * returns { success, reset } where `reset` is the epoch-ms instant the window
 * frees up again. Timestamps are pruned lazily; stale keys are dropped once
 * their whole window has passed so the map cannot grow unbounded.
 */
function limit(bucket: string, attempts: number, windowMs: number) {
  const now = Date.now();
  let hits = windows.get(bucket);
  if (!hits) {
    hits = new Map<string, number[]>();
    windows.set(bucket, hits);
  }
  const arr = hits.get(bucket) ?? [];
  const fresh = arr.filter((t) => now - t < windowMs);
  const success = fresh.length < attempts;
  if (success) fresh.push(now);
  hits.set(bucket, fresh);
  const reset = fresh.length ? fresh[0] + windowMs : now + windowMs;
  // Opportunistic global prune (cheap: only when the map grows)
  if (hits.size > 5_000) {
    for (const [k, v] of hits) {
      const last = v[v.length - 1];
      if (!last || now - last > windowMs) hits.delete(k);
    }
  }
  return { success, reset };
}

// -------------------------------------------------------------- policies ---

export type RatelimitWindow = string; // "5 s" | "1 m" | "24 h" — dub's format

export type RatelimitMessageContext = {
  retryAfter: string;
  attempts: number;
  window: string;
};

export type RatelimitPolicy = {
  attempts: number;
  window: RatelimitWindow;
  keyPrefix: string;
  message?: string | ((ctx: RatelimitMessageContext) => string);
};

const s = (n: number) => (n === 1 ? "1 second" : `${n} seconds`);
const min = (n: number) => (n === 1 ? "1 minute" : `${n} minutes`);

/** Formats ms until reset as a human-friendly duration (dub's helper). */
export const formatRetryAfter = (resetAt: number) => {
  const seconds = Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1);
  if (seconds < 60) return s(seconds);
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return min(minutes);
  const hours = Math.ceil(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};

/**
 * The policy table — a direct adaptation of dub's RATELIMIT_POLICIES to this
 * product's write surface. Limits are deliberately generous: they exist to
 * stop abuse and runaway loops, never normal use.
 */
export const RATELIMIT_POLICIES = {
  // Auth brute-force protection (dub: login = 5/min)
  login: {
    attempts: 10,
    window: "1 m",
    keyPrefix: "rl:auth:login",
  },
  register: {
    attempts: 5,
    window: "1 m",
    keyPrefix: "rl:auth:register",
  },
  // AI tutor endpoints — every call costs provider quota
  ai: {
    attempts: 20,
    window: "1 m",
    keyPrefix: "rl:ai",
  },
  // Free MT relay (public endpoint)
  translate: {
    attempts: 30,
    window: "1 m",
    keyPrefix: "rl:translate",
  },
  // Feed engagement signal — the client emits one per card view
  feedSignal: {
    attempts: 240,
    window: "1 m",
    keyPrefix: "rl:feed:signal",
  },
  // Group chat writes
  chatSend: {
    attempts: 60,
    window: "1 m",
    keyPrefix: "rl:chat:send",
  },
  // Test writes (create / update / copy / delete / share)
  testWrite: {
    attempts: 60,
    window: "1 m",
    keyPrefix: "rl:tests:write",
  },
  // Uploads (multipart) — heavier than JSON writes
  upload: {
    attempts: 30,
    window: "1 m",
    keyPrefix: "rl:upload",
  },
} as const satisfies Record<string, RatelimitPolicy>;

export type RatelimitPolicyKey = keyof typeof RATELIMIT_POLICIES;

/**
 * Enforces a rate limit policy for the given identifier, throwing a
 * rate_limit_exceeded ApiError when the limit is exceeded (dub's
 * assertRateLimit).
 */
export async function assertRateLimit({
  policy,
  identifier,
}: {
  policy: RatelimitPolicy;
  identifier: string | string[]; // dynamic part(s) of the key, e.g. email or [email, ip]
}) {
  const key = [
    policy.keyPrefix,
    ...(Array.isArray(identifier) ? identifier : [identifier]),
  ].join(":");

  const { success, reset } = limit(
    key,
    policy.attempts,
    parseWindowMs(policy.window)
  );

  if (!success) {
    const retryAfter = formatRetryAfter(reset);
    const message =
      typeof policy.message === "function"
        ? policy.message({ retryAfter, attempts: policy.attempts, window: policy.window })
        : `Too many requests. Please try again in ${retryAfter}.`;
    throw new ApiError({ code: "rate_limit_exceeded", message });
  }
}
