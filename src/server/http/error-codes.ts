// ---------------------------------------------------------------------------
// Error-code → HTTP-status table.
//
// Ported from the professional open-source API backend of dubinc/dub
// (https://github.com/dubinc/dub — apps/web/lib/api/error-codes.ts), the
// reference architecture this backend layer follows. Codes that only exist
// in dub's billing/OAuth domain (exceeded_limit, invite_*) are not needed
// here; payload_too_large replaces them so upload guards can speak the same
// vocabulary.
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  payload_too_large: 413,
  conflict: 409,
  unprocessable_entity: 422,
  rate_limit_exceeded: 429,
  internal_server_error: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type HttpStatusCode = (typeof ErrorCodes)[ErrorCode];
