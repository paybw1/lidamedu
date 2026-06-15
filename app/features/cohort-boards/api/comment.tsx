// feat-6-010 반별 게시판 — 댓글 작성/삭제 액션. RLS client(쓰기 권한·삭제 권한 모두 DB 강제).
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";

import {
  createBoardComment,
  softDeleteBoardComment,
} from "../queries.server";

import type { Route } from "./+types/comment";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    postId: z.string().uuid(),
    bodyMd: z.string().trim().min(1).max(10000),
  }),
  z.object({ intent: z.literal("delete"), commentId: z.string().uuid() }),
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

  const parsed = schema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success)
    return data({ ok: false, error: "invalid-input" }, { status: 400, headers });
  const input = parsed.data;

  if (input.intent === "create") {
    const result = await createBoardComment(client, user.id, {
      postId: input.postId,
      bodyMd: input.bodyMd,
    });
    if (!result.ok)
      return data({ ok: false, error: result.error }, { status: 400, headers });
    return data({ ok: true, commentId: result.commentId }, { headers });
  }

  // delete (soft) — RPC 가 작성자/관리자만 허용, 영향 행 0 이면 권한 없음.
  const result = await softDeleteBoardComment(client, input.commentId);
  if (!result.ok)
    return data({ ok: false, error: result.error }, { status: 400, headers });
  return data({ ok: true }, { headers });
}
