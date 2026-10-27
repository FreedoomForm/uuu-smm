// ---------------------------------------------------------------------------
// Request parsing helpers — ported from dubinc/dub
// (apps/web/lib/api/utils.ts parseRequestBody) and extended with a query
// parser. zod schemas live next to the services that own their domain.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError } from "./errors";

/** Parse the JSON body, mapping malformed JSON to a 400 (dub's helper). */
export async function parseRequestBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw ApiError.badRequest(
      "Invalid JSON format in request body. Please ensure the request body is a valid JSON object."
    );
  }
}

/** Parse the body AND validate it with a zod schema in one step. */
export async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S
): Promise<z.infer<S>> {
  const body = await parseRequestBody(req);
  return schema.parse(body);
}

/** Validate the query string of a request with a zod schema. */
export function parseQuery<S extends z.ZodType>(
  req: NextRequest,
  schema: S
): z.infer<S> {
  const sp = req.nextUrl.searchParams;
  const obj: Record<string, string> = {};
  sp.forEach((v, k) => {
    obj[k] = v;
  });
  return schema.parse(obj);
}
