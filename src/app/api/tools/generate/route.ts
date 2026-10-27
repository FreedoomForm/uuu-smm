// FREE TOOLS — AI generation for the tourism business (столп 4):
// content-plan | reels-ideas | hashtags. PUBLIC endpoint (the tools page is
// open to every visitor — the retention hook of the idea), rate-limited per
// user/IP because every call costs provider quota.
import { NextResponse } from "next/server";
import { withApi } from "@/server/http/handler";
import { generateTool } from "@/server/services/tools.service";
import { isLang } from "@/lib/i18n";

export const POST = withApi(
  async ({ req }) => {
    const body = await req.json();
    const lang = isLang(body.lang) ? body.lang : "ru";
    const text = await generateTool(
      typeof body.kind === "string" ? body.kind : "content-plan",
      typeof body.business === "string" ? body.business : "",
      typeof body.platform === "string" ? body.platform : "",
      lang,
      typeof body.details === "string" ? body.details : ""
    );
    return NextResponse.json({ text });
  },
  { rateLimit: "ai" }
);
