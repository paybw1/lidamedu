// 커뮤니티 게시판 댓글 액션 — 작성/삭제. feat-6-002.
// 삭제 권한(작성자/운영자)은 community_post_comments RLS 가 강제한다.
import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { runAfterResponse } from "~/core/lib/wait-until.server";

import { notifyMentions } from "../notify.server";
import {
  createComment,
  getPost,
  softDeleteComment,
} from "../queries.server";

import type { Route } from "./+types/comment";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    postId: z.string().uuid(),
    bodyMd: z.string().trim().min(1).max(5000),
  }),
  z.object({
    intent: z.literal("delete"),
    commentId: z.string().uuid(),
  }),
]);

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
    const post = await getPost(client, input.postId);
    if (!post) {
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    }
    const result = await createComment(client, user.id, {
      postId: input.postId,
      bodyMd: input.bodyMd,
    });
    if (!result.ok) {
      return data({ ok: false, error: result.error }, { status: 400, headers });
    }
    // feat-6 v2.2 — 글 작성자에게 댓글 알림 (본인 댓글 제외, best-effort).
    if (post.author?.id && post.author.id !== user.id) {
      const preview =
        input.bodyMd.length > 80
          ? input.bodyMd.slice(0, 80) + "…"
          : input.bodyMd;
      runAfterResponse(
        (async () => {
          const { error } = await adminClient
            .from("user_notifications")
            .insert({
              recipient_id: post.author!.id,
              kind: "community_post_comment",
              entity_type: "community_post",
              entity_id: post.postId,
              title: `새 댓글: ${post.title}`,
              body: preview,
              href: `/community/${post.board}/${post.postId}`,
            });
          if (error) {
            console.warn(
              "[community comment notify] insert 실패:",
              error.message,
            );
          }
        })(),
      );
    }
    // feat-6-004 — 댓글 본문 멘션 알림 (best-effort).
    const { data: me } = await client
      .from("profiles")
      .select("name")
      .eq("profile_id", user.id)
      .maybeSingle();
    runAfterResponse(
      notifyMentions({
        body: input.bodyMd,
        postId: post.postId,
        postTitle: post.title,
        postBoard: post.board,
        authorId: user.id,
        authorName: me?.name ?? "(이름 없음)",
        kind: "comment",
      }),
    );
    return data({ ok: true, commentId: result.commentId }, { headers });
  }

  // delete (soft) — RLS 가 작성자/운영자만 허용, 영향 행 0 이면 권한 없음
  const result = await softDeleteComment(client, input.commentId);
  if (!result.ok) {
    return data({ ok: false, error: result.error }, { status: 400, headers });
  }
  return data({ ok: true }, { headers });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
