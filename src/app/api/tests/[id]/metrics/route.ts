// GET /api/tests/[id]/metrics — the AI test passport readout.
//
// Public read (same access model as GET /api/tests/[id]): the passport cards
// are shown to everyone who can open the test. The personal scale ("how well
// YOU know this topic") requires a session — anonymous viewers get
// userKnows: null and the card renders "no data yet".
//
// First read of a test without a passport triggers the AI generation under
// the hood (normally it was already generated at test-creation time).
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { getTestMetricsView } from "@/server/services/test-metrics.service";

export const runtime = "nodejs";

export const GET = withApi(async ({ params, userId }) => {
  const metrics = await getTestMetricsView(params.id, userId);
  return NextResponse.json(metrics);
});
