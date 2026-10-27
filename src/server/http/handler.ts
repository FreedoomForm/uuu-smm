// ---------------------------------------------------------------------------
// The single route-handler wrapper — every API route of this app is defined
// through it. Ported from dubinc/dub's withWorkspace
// (apps/web/lib/auth/workspace.ts): one place that
//
//   * resolves dynamic route params,
//   * resolves the caller identity (httpOnly session cookie → DB lookup),
//   * enforces the route's rate-limit policy,
//   * enforces authentication,
//   * runs the handler and maps ANY thrown error to a consistent JSON
//     envelope via handleApiError,
//   * logs one structured request line (method, path, status, ms).
//
// Routes stay thin controllers; business logic lives in src/server/services.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { ApiError, handleApiError } from "./errors";
import {
  RATELIMIT_POLICIES,
  RatelimitPolicyKey,
  assertRateLimit,
} from "./rate-limit";
import { sessionUserId } from "../auth/session";

export type ApiContext = {
  req: NextRequest;
  params: Record<string, string>;
  searchParams: URLSearchParams;
  /** User id resolved from the httpOnly session cookie (DB-backed). */
  userId: string | null;
  /** Best-effort client IP for per-IP rate limits. */
  ip: string;
  requestId: string;
};

export type AuthedApiContext = ApiContext & { userId: string };

type WithApiOptions = {
  /** Rate-limit policy from RATELIMIT_POLICIES (keyed by user or IP). */
  rateLimit?: RatelimitPolicyKey;
  /** Extra limiter identifier (e.g. email for login). */
  rateIdentifier?: string;
};

type Handler<C> = (ctx: C) => Promise<Response> | Response;

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function logRequest(
  requestId: string,
  method: string,
  path: string,
  status: number,
  startedAt: number
) {
  const ms = Date.now() - startedAt;
  if (status >= 500) {
    console.error(
      `[api] ${requestId} ${method} ${path} -> ${status} (${ms}ms)`
    );
  } else {
    console.log(
      `[api] ${requestId} ${method} ${path} -> ${status} (${ms}ms)`
    );
  }
}

/** Wrap a PUBLIC endpoint (anonymous allowed). */
export function withApi(
  handler: Handler<ApiContext>,
  opts: WithApiOptions = {}
) {
  return async (
    req: NextRequest,
    routeCtx?: { params: Promise<Record<string, string>> }
  ): Promise<Response> => {
    const startedAt = Date.now();
    const requestId = Math.random().toString(36).slice(2, 10);
    const path = req.nextUrl.pathname;
    let status = 500;

    try {
      const params = (await routeCtx?.params) || {};
      const userId = await sessionUserId(req);
      const ip = clientIp(req);

      if (opts.rateLimit) {
        const policy = RATELIMIT_POLICIES[opts.rateLimit];
        await assertRateLimit({ policy, identifier: opts.rateIdentifier ?? (userId || ip) });
      }

      const res = await handler({
        req,
        params,
        searchParams: req.nextUrl.searchParams,
        userId,
        ip,
        requestId,
      });
      status = res.status;
      return res;
    } catch (error) {
      const { status: errStatus, body } = handleApiError(error);
      status = errStatus;
      return NextResponse.json(body, { status: errStatus });
    } finally {
      logRequest(requestId, req.method, path, status, startedAt);
    }
  };
}

/**
 * Wrap an AUTHENTICATED endpoint. The session resolution in withApi already
 * proves the user exists (the cookie maps to a live Session row), so no
 * extra DB round-trip is needed here.
 */
export function withApiAuth(
  handler: Handler<AuthedApiContext>,
  opts: WithApiOptions = {}
) {
  return withApi(async (ctx) => {
    if (!ctx.userId) {
      throw ApiError.unauthorized("Not authenticated");
    }
    return handler({ ...ctx, userId: ctx.userId });
  }, opts);
}
