// Notes about a test — the "small contribution" path: when a fork would
// change fewer than 2 questions, the app offers to write a note instead.
//   GET  /api/tests/[id]/notes — list (public, they enrich the tree view)
//   POST /api/tests/[id]/notes — create (signed-in users, rate-limited)
import { NextResponse } from "next/server";
import { withApi, withApiAuth } from "@/server/http/handler";
import { parseBody } from "@/server/http/validation";
import { z } from "zod";
import { createTestNote, listTestNotes } from "@/server/services/tests.service";

export const runtime = "nodejs";

const createNoteSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const GET = withApi(async ({ params }) => {
  const notes = await listTestNotes(params.id);
  return NextResponse.json({ notes });
});

export const POST = withApiAuth(
  async ({ userId, params, req }) => {
    const body = await parseBody(req, createNoteSchema);
    const note = await createTestNote(userId, params.id, body.text);
    return NextResponse.json(note, { status: 201 });
  },
  { rateLimit: "chatSend" }
);
