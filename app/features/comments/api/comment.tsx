// 메모 CRUD API — 조문/판례/문제 공용.
// feat-8-023: 강사·수험생 모두 작성. 가시성은 RLS 가 작성자 역할로 판정한다.
import type { Route } from "./+types/comment";

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  createComment,
  deleteComment,
  updateComment,
} from "~/features/comments/queries.server";

const createSchema = z.object({
  intent: z.literal("create"),
  targetType: z.enum(["article", "case", "problem"]),
  targetId: z.string().uuid(),
  bodyMd: z.string().min(1).max(16000),
  isPinned: z.coerce.boolean().optional(),
});

const updateSchema = z.object({
  intent: z.literal("update"),
  commentId: z.string().uuid(),
  bodyMd: z.string().min(1).max(16000).optional(),
  isPinned: z.coerce.boolean().optional(),
});

const deleteSchema = z.object({
  intent: z.literal("delete"),
  commentId: z.string().uuid(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "");

  if (intent === "create") {
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const d = parsed.data;
    const res = await createComment(client, {
      targetType: d.targetType,
      targetId: d.targetId,
      bodyMd: d.bodyMd,
      authorId: user.id,
      isPinned: d.isPinned,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true, commentId: res.commentId });
  }

  if (intent === "update") {
    const parsed = updateSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    // 권한(본인 또는 admin)은 content_comments RLS 가 강제한다.
    const res = await updateComment(client, parsed.data.commentId, {
      bodyMd: parsed.data.bodyMd,
      isPinned: parsed.data.isPinned,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  if (intent === "delete") {
    const parsed = deleteSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return data({ error: "입력 오류" }, { status: 400 });
    const res = await deleteComment(client, parsed.data.commentId);
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: true });
  }

  return data({ error: `알 수 없는 intent: ${intent}` }, { status: 400 });
}
