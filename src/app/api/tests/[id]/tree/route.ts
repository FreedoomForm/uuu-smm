// GET /api/tests/[id]/tree — the whole version family of a test (trunk +
// every branch), each node carrying its creator. Public read (same access
// model as GET /api/tests/[id]): a version is reachable by its direct link,
// and the tree is what that link shows.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { getTestTree } from "@/server/services/tests.service";

export const runtime = "nodejs";

export const GET = withApi(async ({ params }) => {
  const tree = await getTestTree(params.id);
  return NextResponse.json(tree);
});
