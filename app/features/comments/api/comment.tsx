// 통합 코멘트 CRUD API — 조문/판례/문제 공용.
// feat-8-022: create 는 텍스트형(bodyMd) 또는 하이라이트형(앵커) 코멘트를 받는다.

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

const COMMENT_COLORS = ["green", "yellow", "red", "blue"] as const;

const createSchema = z
  .object({
    intent: z.literal("create"),
    targetType: z.enum(["article", "case", "problem"]),
    targetId: z.string().uuid(),
    bodyMd: z.string().max(16000).optional(),
    isPinned: z.coerce.boolean().optional(),
    // 하이라이트형 코멘트 앵커 — 모두 함께 제공되어야 한다.
    fieldPath: z.string().max(200).optional(),
    startOffset: z.coerce.number().int().nonnegative().optional(),
    endOffset: z.coerce.number().int().nonnegative().optional(),
    contentHash: z.string().max(128).optional(),
    color: z.enum(COMMENT_COLORS).optional(),
    label: z.string().max(4000).optional(),
  })
  .refine(
    (d) =>
      (d.bodyMd !== undefined && d.bodyMd.trim().length > 0) ||
      (d.fieldPath !== undefined &&
        d.startOffset !== undefined &&
        d.endOffset !== undefined &&
        d.contentHash !== undefined &&
        d.color !== undefined),
    { message: "코멘트 본문 또는 하이라이트 구간이 필요합니다." },
  );

const updateSchema = z.object({
  intent: z.literal("update"),
  commentId: z.string().uuid(),
  bodyMd: z.string().min(1).max(16000).optional(),
  isPinned: z.coerce.boolean().optional(),
  color: z.enum(COMMENT_COLORS).optional(),
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
    const d = parsed.data;
    const anchor =
      d.fieldPath !== undefined &&
      d.startOffset !== undefined &&
      d.endOffset !== undefined &&
      d.contentHash !== undefined &&
      d.color !== undefined
        ? {
            fieldPath: d.fieldPath,
            startOffset: d.startOffset,
            endOffset: d.endOffset,
            contentHash: d.contentHash,
            color: d.color,
            label: d.label ?? null,
          }
        : undefined;
    const res = await createComment(client, {
      targetType: d.targetType,
      targetId: d.targetId,
      bodyMd:
        d.bodyMd !== undefined && d.bodyMd.trim().length > 0
          ? d.bodyMd
          : null,
      authorId: user.id,
      isPinned: d.isPinned,
      anchor,
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
      color: parsed.data.color,
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
