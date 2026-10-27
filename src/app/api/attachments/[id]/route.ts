// PUT    /api/attachments/[id] — edit metadata (any authenticated user,
//                               same open policy as test editing)
// DELETE /api/attachments/[id] — remove (+ best-effort channel cleanup)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { attachmentInputSchema } from "@/server/schemas";
import {
  deleteAttachment,
  updateAttachment,
} from "@/server/services/attachments.service";

export const PUT = withApiAuth(
  async ({ params, req }) => {
    const body = await parseBody(req, attachmentInputSchema.partial());
    const updated = await updateAttachment(params.id, body);
    return NextResponse.json(updated);
  },
  { rateLimit: "testWrite" }
);

export const DELETE = withApiAuth(
  async ({ params }) => {
    const result = await deleteAttachment(params.id);
    return NextResponse.json(result);
  },
  { rateLimit: "testWrite" }
);
