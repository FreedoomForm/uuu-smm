// SMM SPECIALISTS — the customer's публичная библиотека (cards with the 4 params)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { listSpecialists } from "@/server/services/smm2.service";

export const GET = withApiAuth(async () => {
  return NextResponse.json(await listSpecialists());
});
