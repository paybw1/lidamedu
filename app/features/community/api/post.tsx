// 커뮤니티 게시글 액션 — 작성/수정/삭제/고정/마감. feat-6-002.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { data, redirect } from "react-router";
import { z } from "zod";

import { roleAtLeast, type UserRole } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";

import { communityBoardSchema } from "../labels";
import {
  createPost,
  getPost,
  setPostClosed,
  setPostPinned,
  softDeletePost,
  updatePost,
} from "../queries.server";

import type { Route } from "./+types/post";

// 폼 boolean — z.coerce.boolean() 은 "false" 도 true 가 되므로 명시 enum 으로 받는다.
const boolField = z.enum(["true", "false"]).transform((v) => v === "true");
const titleField = z.string().trim().min(1).max(200);
const bodyField = z.string().trim().min(1).max(20000);

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    board: communityBoardSchema,
    title: titleField,
    bodyMd: bodyField,
  }),
  z.object({
    intent: z.literal("update"),
    postId: z.string().uuid(),
    title: titleField,
    bodyMd: bodyField,
  }),
  z.object({ intent: z.literal("delete"), postId: z.string().uuid() }),
  z.object({
    intent: z.literal("pin"),
    postId: z.string().uuid(),
    pinned: boolField,
  }),
  z.object({
    intent: z.literal("close"),
    postId: z.string().uuid(),
    closed: boolField,
  }),
]);

async function currentRole(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<UserRole> {
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("profile_id", userId)
    .maybeSingle();
  return profile?.role ?? "student";
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });
  }

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });
  }

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return data(
      { ok: false, error: "invalid-input", issues: parsed.error.issues },
      { status: 400, headers },
    );
  }
  const input = parsed.data;

  if (input.intent === "create") {
    const result = await createPost(client, user.id, {
      board: input.board,
      title: input.title,
      bodyMd: input.bodyMd,
    });
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    return redirect(`/community/${input.board}/${result.postId}`, { headers });
  }

  // update/delete/pin/close — 게시글 존재 확인 후 intent 별 권한 검증
  const post = await getPost(client, input.postId);
  if (!post) {
    return data({ ok: false, error: "not-found" }, { status: 404, headers });
  }
  const role = await currentRole(client, user.id);
  const isAuthor = post.author?.id === user.id;
  const isManager = roleAtLeast(role, "manager");

  if (input.intent === "update") {
    if (!isAuthor) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const result = await updatePost(client, post.postId, {
      title: input.title,
      bodyMd: input.bodyMd,
    });
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    return redirect(`/community/${post.board}/${post.postId}`, { headers });
  }

  if (input.intent === "delete") {
    if (!isAuthor && !isManager) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const result = await softDeletePost(client, post.postId);
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    return redirect(`/community/${post.board}`, { headers });
  }

  if (input.intent === "pin") {
    if (!isManager) {
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    }
    const result = await setPostPinned(client, post.postId, input.pinned);
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    return data({ ok: true }, { headers });
  }

  // close — study 게시판 모집 마감/재개
  if (!isAuthor && !isManager) {
    return data({ ok: false, error: "forbidden" }, { status: 403, headers });
  }
  const result = await setPostClosed(client, post.postId, input.closed);
  if (!result.ok) {
    return data({ ok: false, error: result.error }, { status: 400, headers });
  }
  return data({ ok: true }, { headers });
}
