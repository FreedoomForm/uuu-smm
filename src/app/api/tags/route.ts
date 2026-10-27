// Global tag dictionary for autocomplete in the test editor.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { listTags } from "@/server/services/tags.service";

export const GET = withApi(async () => {
  try {
    const result = await listTags();
    return NextResponse.json(result);
  } catch {
    // Autocomplete must never hard-fail the editor
    return NextResponse.json({ tags: [] });
  }
});
