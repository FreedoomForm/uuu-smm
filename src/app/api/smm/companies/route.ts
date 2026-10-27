// КАТАЛОГ КОМПАНИЙ — the customers side of the catalog (tourism business
// cards + open orders count). Signed-in (the catalog lives inside the app).
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listCompanies } from "@/server/services/smm2.service";

export const GET = withApiAuth(async () => {
  return NextResponse.json(await listCompanies());
});
