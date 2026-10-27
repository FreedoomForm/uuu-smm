import { withApi } from "@/server/http/handler";
import { parseRequestBody } from "@/server/http/validation";
import { feedQuerySchema, feedSignalSchema } from "@/server/schemas";
import { getFeed, recordFeedSignal } from "@/server/services/feed.service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/feed — the scalable, personalized test feed.
//
// ?tab=foryou|trending|new   feed ranking mode (default foryou)
// &cursor=...                opaque pagination cursor ("o:<offset>" for foryou /
//                            trending, "createdAt|id" keyset for new)
// &limit=10                  page size (max 20)
// &tag=...                   filter by one tag
// &q=...                     search by TAGS (partial, case-insensitive)
// &creatorId=...             only tests of one author ("my tests")
// &scope=all|mine|discover   dashboard content scope
//
// Ranking funnel lives in feed.service (multi-source retrieval → seen/skip
// filter → engagement scoring with UCB exploration → diversity re-rank).
// Response contract: { items, nextCursor, tab, tagInfo?, personalized? }
// ---------------------------------------------------------------------------
export const GET = withApi(async ({ req, userId }) => {
  const sp: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const query = feedQuerySchema.parse(sp);
  return getFeed(query, userId);
});

// ---------------------------------------------------------------------------
// POST /api/feed — engagement signals for the recommendation funnel.
// Body: { testId, kind: 'view'|'skip', ms? }
// Anonymous/invalid submissions keep the historical silent { ok: false }.
// ---------------------------------------------------------------------------
export const POST = withApi(
  async ({ req, userId }) => {
    const raw = await parseRequestBody(req).catch(() => ({}));
    const parsed = feedSignalSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ ok: false });
    return recordFeedSignal(parsed.data, userId);
  },
  { rateLimit: "feedSignal" }
);
