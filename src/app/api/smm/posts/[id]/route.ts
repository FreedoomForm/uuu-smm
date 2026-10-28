// SMM POST [id] — read-by-link / edit / delete (owner-only writes)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import { getPost, updatePost, deletePost } from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ params }) => {
  return NextResponse.json(await getPost(params.id));
});

export const PUT = withApiAuth(async ({ userId, params, req }) => {
  const body = await req.json();
  return NextResponse.json(await updatePost(userId, params.id, body));
});

export const DELETE = withApiAuth(async ({ userId, params }) => {
  return NextResponse.json(await deletePost(userId, params.id));
});
