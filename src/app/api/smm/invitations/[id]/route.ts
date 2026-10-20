// One invitation (the customer's sent request).
// PUT    — edit the message while it is still pending (author only)
// DELETE — withdraw the pending request (author only; the row disappears)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRequestMessageSchema } from "@/server/schemas";
import { updateRequestMessage, withdrawRequest } from "@/server/services/smm.service";

export const PUT = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, smmRequestMessageSchema);
    return NextResponse.json(await updateRequestMessage("invitation", params.id, userId, body.message));
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(
  async ({ userId, params }) => {
    return NextResponse.json(await withdrawRequest("invitation", params.id, userId));
  },
  { rateLimit: "testWrite" }
);
