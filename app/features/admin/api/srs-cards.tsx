// feat-2-023 — 암기 카드 생성 운영자 action. preview(dry-run) / generate / soft-delete.
// staff 게이트. 쓰기는 service-role(adminClient) — srs_items 는 전역 공유 콘텐츠.

import { data } from "react-router";
import { z } from "zod";

import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import {
  generateCards,
  previewCards,
  softDeleteCard,
} from "~/features/srs/card-gen.server";
import {
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/srs-cards";

const ParamsSchema = z.object({
  subject: z
    .string()
    .refine(
      (v): v is LawSubjectSlug =>
        (LAW_SUBJECT_SLUGS as readonly string[]).includes(v),
      "지원하지 않는 과목",
    ),
  sourceType: z.enum(["article", "case"]),
  importanceMin: z.coerce.number().int().min(0).max(5),
  limit: z.coerce.number().int().min(1).max(500),
});

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ ok: false, error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ ok: false, error: "Forbidden" }, { status: 403 });

  const form = await request.formData();
  const intent = form.get("intent");

  // 소프트삭제 — itemId 만 필요.
  if (intent === "soft-delete") {
    const itemId = String(form.get("itemId") ?? "");
    if (!itemId)
      return data({ ok: false, error: "itemId 누락" }, { status: 400 });
    await softDeleteCard(adminClient, itemId);
    return data({ ok: true });
  }

  const parsed = ParamsSchema.safeParse({
    subject: form.get("subject"),
    sourceType: form.get("sourceType"),
    importanceMin: form.get("importanceMin"),
    limit: form.get("limit"),
  });
  if (!parsed.success) {
    return data(
      { ok: false, error: parsed.error.issues[0]?.message ?? "입력 오류" },
      { status: 400 },
    );
  }
  const params = {
    subject: parsed.data.subject as LawSubjectSlug,
    sourceType: parsed.data.sourceType,
    importanceMin: parsed.data.importanceMin,
    limit: parsed.data.limit,
  };

  if (intent === "preview") {
    const preview = await previewCards(adminClient, params);
    return data({ ok: true, preview });
  }
  if (intent === "generate") {
    const updateExisting = form.get("update") === "true";
    const result = await generateCards(
      adminClient,
      params,
      user.id,
      updateExisting,
    );
    return data({ ok: true, result });
  }
  return data({ ok: false, error: "알 수 없는 intent" }, { status: 400 });
}
