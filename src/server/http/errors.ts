// ---------------------------------------------------------------------------
// API error type + the single place where every thrown error becomes a
// response.
//
// Ported from dubinc/dub (https://github.com/dubinc/dub):
//   * DubApiError            → ApiError (code + message, knows its status)
//   * fromZodError           → readable one-line zod failure message
//   * handleApiError         → catch-all mapper used by withApi (handler.ts)
// Prisma's two user-facing error kinds (unique violation / record not found)
// are mapped to 409 / 404 the way dub's service layer maps its own.
// ---------------------------------------------------------------------------

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ErrorCode, ErrorCodes } from "./error-codes";

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;

  constructor({ code, message }: { code: ErrorCode; message: string }) {
    super(message);
    this.code = code;
    this.status = ErrorCodes[code];
  }

  /** Throwing helpers — call sites read like dub's. */
  static badRequest(message: string) {
    return new ApiError({ code: "bad_request", message });
  }
  static unauthorized(message = "Not authenticated") {
    return new ApiError({ code: "unauthorized", message });
  }
  static forbidden(message: string) {
    return new ApiError({ code: "forbidden", message });
  }
  static notFound(message: string) {
    return new ApiError({ code: "not_found", message });
  }
  static payloadTooLarge(message: string) {
    return new ApiError({ code: "payload_too_large", message });
  }
  static conflict(message: string) {
    return new ApiError({ code: "conflict", message });
  }
  static unprocessable(message: string) {
    return new ApiError({ code: "unprocessable_entity", message });
  }
  static rateLimitExceeded(message: string) {
    return new ApiError({ code: "rate_limit_exceeded", message });
  }
  static internal(message: string) {
    return new ApiError({ code: "internal_server_error", message });
  }
}

/** Collapse a zod failure into one readable line: `path: message`. */
export function fromZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => {
      const path = i.path.length ? i.path.join(".") : "body";
      return `${path}: ${i.message}`;
    })
    .join("; ");
}

/** Shape every client of this API receives on failure. */
export type ApiErrorBody = { error: string; code?: ErrorCode };

export function apiErrorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: message, code };
}

/**
 * The dub `handleApiError` equivalent: map ANY thrown value to a
 * (status, body) pair. Unknown errors are logged and hidden behind a generic
 * 500 so internals never leak to clients.
 */
export function handleApiError(error: unknown): {
  status: number;
  body: ApiErrorBody;
} {
  // Our own error type — the happy path of error handling
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: apiErrorBody(error.code, error.message),
    };
  }

  // zod validation failures → 422 Unprocessable Entity (dub standard)
  if (error instanceof z.ZodError) {
    return {
      status: 422,
      body: apiErrorBody("unprocessable_entity", fromZodError(error)),
    };
  }

  // Prisma: unique constraint → 409; record missing → 404
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return {
        status: 409,
        body: apiErrorBody("conflict", "This record already exists"),
      };
    }
    if (error.code === "P2025") {
      return {
        status: 404,
        body: apiErrorBody("not_found", "Record not found"),
      };
    }
  }

  // Prisma connection/timeout class of problems
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    console.error("[api] database error:", error.message);
    return {
      status: 500,
      body: apiErrorBody(
        "internal_server_error",
        "Database is temporarily unavailable"
      ),
    };
  }

  // Unknown — never leak internals
  const message = error instanceof Error ? error.message : String(error);
  console.error("[api] unhandled error:", message);
  return {
    status: 500,
    body: apiErrorBody(
      "internal_server_error",
      "An unexpected error occurred. Please try again."
    ),
  };
}
