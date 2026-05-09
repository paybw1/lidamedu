// 조문 코멘트/평석 — 강사·운영자만 작성/수정/삭제. 학생은 read-only.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  deleteArticleComment,
  getStaffRole,
  upsertArticleComment,
} from "~/features/laws/queries.server";

import type { Route } from "./+types/article-comment";

const schema = z.object({
  intent: z.enum(["save", "delete"]),
  articleId: z.string().uuid(),
  bodyMd: z.string().max(10000).optional(),
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

  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Staff only" }, { status: 403 });

  const form = await request.formData();
  const parsed = schema.safeParse({
    intent: form.get("intent"),
    articleId: form.get("articleId"),
    bodyMd: form.get("bodyMd") ?? undefined,
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.intent === "save") {
    const body = (parsed.data.bodyMd ?? "").trim();
    if (body.length === 0) {
      return data({ error: "본문을 입력해 주세요" }, { status: 400 });
    }
    await upsertArticleComment(client, parsed.data.articleId, user.id, body);
  } else {
    await deleteArticleComment(client, parsed.data.articleId);
  }
  return data({ ok: true });
}
