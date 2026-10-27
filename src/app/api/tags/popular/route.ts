// GET /api/tags/popular — top tags across public tests (feed filter chips).
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { getPopularTags } from "@/server/services/tags.service";

export const GET = withApi(async () => {
  try {
    const result = await getPopularTags();
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ tags: [] });
  }
});
