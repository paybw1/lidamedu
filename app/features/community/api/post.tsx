// 커뮤니티 게시글 액션 — 작성/수정/삭제/고정/마감. feat-6-002.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { data, redirect } from "react-router";
import { z } from "zod";

import { roleAtLeast, type UserRole } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";

import { communityBoardSchema } from "../labels";
import { notifyMentions, notifyPostLiked } from "../notify.server";
import {
  createPost,
  getPost,
  setPostClosed,
  setPostPinned,
  softDeletePost,
  togglePostLike,
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
  // feat-6 v2.1 — 좋아요 토글.
  z.object({ intent: z.literal("toggle_like"), postId: z.string().uuid() }),
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

async function currentName(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<string> {
  const { data } = await client
    .from("profiles")
    .select("name")
    .eq("profile_id", userId)
    .maybeSingle();
  return data?.name ?? "(이름 없음)";
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

  const formData = await request.formData();
  // 작성기가 글 저장 후 첨부 이미지를 이어 올리도록 redirect 대신 postId JSON 을 요청.
  const wantJson = formData.get("returnJson") === "1";
  const parsed = schema.safeParse(Object.fromEntries(formData));
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
    // feat-6-004 — 게시글 본문 멘션 알림 (best-effort).
    const meName = await currentName(client, user.id);
    runAfterResponse(
      notifyMentions({
        body: input.bodyMd,
        postId: result.postId,
        postTitle: input.title,
        postBoard: input.board,
        authorId: user.id,
        authorName: meName,
        kind: "post",
      }),
    );
    if (wantJson) {
      return data(
        { ok: true, postId: result.postId, board: input.board },
        { headers },
      );
    }
    return redirect(`/community/${input.board}/${result.postId}`, { headers });
  }

  // toggle_like — 게시글 존재만 확인 후 본인 row 토글 (RLS 가 user_id=auth.uid() 강제).
  if (input.intent === "toggle_like") {
    const exists = await getPost(client, input.postId);
    if (!exists) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    const result = await togglePostLike(client, input.postId, user.id);
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    // feat-6-004 — 신규 좋아요만 알림 (취소는 skip).
    if (result.liked && exists.author?.id) {
      const meName = await currentName(client, user.id);
      runAfterResponse(
        notifyPostLiked({
          postId: exists.postId,
          postTitle: exists.title,
          postBoard: exists.board,
          postAuthorId: exists.author.id,
          likerId: user.id,
          likerName: meName,
        }),
      );
    }
    return data({ ok: true, liked: result.liked }, { headers });
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
    if (wantJson) {
      return data(
        { ok: true, postId: post.postId, board: post.board },
        { headers },
      );
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
