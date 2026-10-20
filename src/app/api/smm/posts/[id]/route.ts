// SMM POST [id] — edit / delete (owner only)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { updatePost, deletePost } from "@/server/services/smm2.service";

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await updatePost(userId, params.id, body));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deletePost(userId, params.id));
});
