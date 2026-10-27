// CHAT LONG-POLL — the Vercel-native realtime: the request is HELD until new
// messages exist (checked every 800ms, up to 25s) and answers instantly. The
// client re-opens it right after each answer → ~1s end-to-end latency.
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { pollChatMessages } from "@/server/services/smm2.service";

// Node function lifetime on Vercel (Hobby caps at 60s; the poll itself ≤25s)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = withApiAuth(async ({ userId, params, searchParams }) => {
  const after = searchParams.get("after") || undefined;
  const waitMs = Number(searchParams.get("wait") || "25000");
  return NextResponse.json(await pollChatMessages(userId, params.id, after, waitMs));
});
