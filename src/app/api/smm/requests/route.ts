// GET  /api/smm/requests?box=mine|public
//        mine   → the specialist's own запросы (steps + application sends)
//        public → every isPublic запрос — «Публичная библиотека»: people
//                 share their request templates (the task-template library)
// POST /api/smm/requests — create a запрос (the «+» button; the test
//        editor's twin submits title/summary/steps/cover here)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { smmRequestCreateSchema } from "@/server/schemas";
import { createRequest, listRequests } from "@/server/services/smm.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  const box = searchParams.get("box") === "public" ? "public" : "mine";
  return NextResponse.json(await listRequests(userId, box));
});

export const POST = withApiAuth(
  async ({ userId, req }) => {
    const body = await parseBody(req, smmRequestCreateSchema);
    return NextResponse.json(await createRequest(userId, body));
  },
  { rateLimit: "testWrite" }
);
