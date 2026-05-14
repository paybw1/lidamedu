// 통합 코멘트 CRUD API — 조문/판례/문제 공용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  createComment,
  deleteComment,
  updateComment,
} from "~/features/comments/queries.server";

import type { Route } from "./+types/comment";

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
    const role = await getStaffRole(client, user.id);
    if (!role)
      return data({ error: "강사/원장만 코멘트 작성 가능" }, { status: 403 });
    const parsed = createSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success)
      return data(
        { error: parsed.error.issues[0]?.message ?? "입력 오류" },
        { status: 400 },
      );
    const res = await createComment(client, {
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      bodyMd: parsed.data.bodyMd,
      authorId: user.id,
      isPinned: parsed.data.isPinned,
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
