import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { articleBodySchema } from "~/features/laws/lib/article-body";
import {
  getStaffRole,
  saveArticleQuickEdit,
} from "~/features/laws/queries.server";

import type { Route } from "./+types/admin-edit-article";

const schema = z.object({
  articleId: z.string().uuid(),
  // 본문은 JSON 문자열로 전달 — 서버에서 articleBodySchema 로 검증.
  bodyJson: z.string().min(1).max(200_000),
  // 메타 (선택)
  displayLabel: z.string().min(1).max(200).optional(),
  importance: z.coerce.number().int().min(1).max(3).optional(),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw data("Method Not Allowed", { status: 405 });
  }
  const fd = await request.formData();
  const parsed = schema.safeParse({
    articleId: fd.get("articleId"),
    bodyJson: fd.get("bodyJson"),
    displayLabel: fd.get("displayLabel") ?? undefined,
    importance: fd.get("importance") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: "입력값이 올바르지 않습니다." } as const;
  }

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;

  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "권한이 없습니다." } as const;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(parsed.data.bodyJson);
  } catch {
    return { ok: false, error: "JSON 형식이 올바르지 않습니다." } as const;
  }
  const bodyResult = articleBodySchema.safeParse(parsedBody);
  if (!bodyResult.success) {
    return {
      ok: false,
      error: "조문 본문 구조가 올바르지 않습니다.",
    } as const;
  }

  // 대상 article 의 law_id 확인 (articleId 위조 방지 — admin client 로 직접 조회)
  const { data: article, error: artErr } = await adminClient
    .from("articles")
    .select("article_id, law_id")
    .eq("article_id", parsed.data.articleId)
    .is("deleted_at", null)
    .maybeSingle();
  if (artErr) return { ok: false, error: artErr.message } as const;
  if (!article) {
    return { ok: false, error: "조문을 찾을 수 없습니다." } as const;
  }

  const result = await saveArticleQuickEdit(adminClient, {
    articleId: article.article_id,
    lawId: article.law_id,
    bodyJson: bodyResult.data,
    authorId: user.id,
    displayLabel: parsed.data.displayLabel,
    importance: parsed.data.importance,
  });
  if (!result.ok) return { ok: false, error: result.error } as const;
  return { ok: true, revisionId: result.revisionId } as const;
}
