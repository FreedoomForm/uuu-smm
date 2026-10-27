import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { attachmentInputSchema } from "@/server/schemas";
import {
  addAttachment,
  listAttachments,
} from "@/server/services/attachments.service";

// GET /api/tests/[id]/attachments — list attachments of a test (public).
export const GET = withApi(async ({ params }) => {
  const attachments = await listAttachments(params.id);
  return NextResponse.json(attachments);
});

// POST /api/tests/[id]/attachments — add an attachment (any authenticated
// user, matching the open test-editing policy).
export const POST = withApiAuth(
  async ({ params, req }) => {
    const body = await parseBody(req, attachmentInputSchema);
    const attachment = await addAttachment(params.id, body);
    return NextResponse.json(attachment, { status: 201 });
  },
  { rateLimit: "testWrite" }
);
