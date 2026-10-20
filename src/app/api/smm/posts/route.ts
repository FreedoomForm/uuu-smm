// SMM POSTS — the specialist's личная библиотека (video/photo + description per role)
import { NextResponse } from "next/server";
import { withApiAuth } from "@/server/http/handler";
import {
  listPosts,
  createPost,
} from "@/server/services/smm2.service";

export const GET = withApiAuth(async ({ userId, searchParams }) => {
  return NextResponse.json(await listPosts(userId, searchParams.get("scope") || "mine", searchParams.get("userId") || undefined));
});

export const POST = withApiAuth(async ({ userId, req }) => {
  const body = await req.json();
  return NextResponse.json(await createPost(userId, body), { status: 201 });
});
