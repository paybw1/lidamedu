// feat-6-010 반별 게시판 — 글 작성/수정/삭제 액션. RLS client(조회·쓰기 모두 DB 강제).
import { data, redirect } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  createBoardPost,
  getBoardPost,
  setBoardPostPinned,
  softDeleteBoardPost,
  updateBoardPost,
} from "../queries.server";

import type { Route } from "./+types/post";

const titleField = z.string().trim().min(1).max(200);
const bodyField = z.string().trim().min(1).max(20000);
// 폼 boolean — z.coerce.boolean()은 "false"도 true가 되므로 명시 enum 으로.
const boolField = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    boardId: z.string().uuid(),
    title: titleField,
    bodyMd: bodyField,
  }),
  z.object({
    intent: z.literal("update"),
    postId: z.string().uuid(),
    title: titleField,
    bodyMd: bodyField,
  }),
  z.object({
    intent: z.literal("delete"),
    postId: z.string().uuid(),
    boardId: z.string().uuid(),
  }),
  z.object({
    intent: z.literal("pin"),
    postId: z.string().uuid(),
    pinned: boolField,
  }),
]);

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return data({ ok: false, error: "method-not-allowed" }, { status: 405 });

  const [client, headers] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user)
    return data({ ok: false, error: "unauthorized" }, { status: 401, headers });

  const fd = await request.formData();
  // 작성 화면에서 첨부를 같이 올릴 때: 서버 redirect 대신 postId 를 JSON 으로 받아
  // 클라가 첨부 업로드 후 직접 이동(글 작성 중 첨부). 플래그 없으면 기존 redirect 동작.
  const deferRedirect = fd.get("deferRedirect") === "true";
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success)
    return data({ ok: false, error: "invalid-input" }, { status: 400, headers });
  const input = parsed.data;

  if (input.intent === "create") {
    const result = await createBoardPost(client, user.id, {
      boardId: input.boardId,
      title: input.title,
      bodyMd: input.bodyMd,
    });
    if (!result.ok)
      return data({ ok: false, error: result.error }, { status: 400, headers });
    if (deferRedirect)
      return data(
        { ok: true, postId: result.postId, boardId: input.boardId },
        { headers },
      );
    return redirect(`/cohort-boards/${input.boardId}/${result.postId}`, {
      headers,
    });
  }

  if (input.intent === "update") {
    const post = await getBoardPost(client, input.postId);
    if (!post)
      return data({ ok: false, error: "not-found" }, { status: 404, headers });
    if (post.author?.profileId !== user.id)
      return data({ ok: false, error: "forbidden" }, { status: 403, headers });
    const result = await updateBoardPost(client, input.postId, {
      title: input.title,
      bodyMd: input.bodyMd,
    });
    if (!result.ok)
      return data({ ok: false, error: result.error }, { status: 400, headers });
    if (deferRedirect)
      return data(
        { ok: true, postId: post.postId, boardId: post.boardId },
        { headers },
      );
    return redirect(`/cohort-boards/${post.boardId}/${post.postId}`, {
      headers,
    });
  }

  if (input.intent === "pin") {
    // 고정 — manager 전용 RPC(+가드 트리거)가 차단. 비관리자는 실패.
    const result = await setBoardPostPinned(client, input.postId, input.pinned);
    if (!result.ok)
      return data({ ok: false, error: result.error }, { status: 400, headers });
    return data({ ok: true }, { headers });
  }

  // delete (soft) — RPC 가 작성자(쓰기권)/게시판 관리자만 허용, 그 외 42501.
  const result = await softDeleteBoardPost(client, input.postId);
  if (!result.ok)
    return data({ ok: false, error: result.error }, { status: 400, headers });
  return redirect(`/cohort-boards/${input.boardId}`, { headers });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
