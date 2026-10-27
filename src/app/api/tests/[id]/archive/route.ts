// GET /api/tests/[id]/archive — stream the test's content archive (the JSON
// file stored in the Telegram channel). Creator-only, or public tests.
import { withApiAuth } from "@/server/http/handler";
import { streamTestArchive } from "@/server/services/tests.service";

export const runtime = "nodejs";

export const GET = withApiAuth(async ({ userId, params }) => {
  return streamTestArchive(userId, params.id);
});
