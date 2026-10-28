// Global tag dictionary for autocomplete in the test editor.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { listTags } from "@/server/services/tags.service";

export const GET = withApi(async () => {
  try {
    const result = await listTags();
    // Perf: the tag dictionary is GLOBAL (not per-user) — the browser serves
    // it from cache for 2 min and revalidates in the background.
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=300" } });
  } catch {
    // Autocomplete must never hard-fail the editor
    return NextResponse.json({ tags: [] }, { headers: { "Cache-Control": "no-store" } });
  }
});
