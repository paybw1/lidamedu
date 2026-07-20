// 운영자 OX 검토 화면에서 한 항목(choice 또는 box-item) 의 ox_truth / ox_ineligible 을 인라인 수정.
// + 조문 매칭 큐: relatedArticleNumber 연결("" = 해제) 및 AI 제안 결정(suggestion) 기록.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getStaffRole } from "~/features/laws/queries.server";
import { LAW_SUBJECT_SLUGS } from "~/features/subjects/lib/subjects";
import {
  decideOxArticleSuggestion,
  setOxItemArticle,
  updateOxReviewItem,
} from "~/features/problems/queries.server";

import type { Route } from "./+types/ox-review-update";

const schema = z.object({
  refType: z.enum(["choice", "box"]),
  refId: z.string().uuid(),
  oxTruth: z.union([z.literal("O"), z.literal("X"), z.literal("")]).optional(),
  oxIneligible: z.union([z.literal("true"), z.literal("false")]).optional(),
  // 스태프 수동 숨김 토글(OX 패널·검수 공용). "true"=숨김, "false"=복원.
  oxHidden: z.union([z.literal("true"), z.literal("false")]).optional(),
  // 조문 연결 — 숫자(의N 포함) 형식, "" = 해제. subject 와 함께 와야 한다.
  relatedArticleNumber: z
    .string()
    .regex(/^$|^\d+(의\d+)?$/)
    .optional(),
  subject: z.enum(LAW_SUBJECT_SLUGS as unknown as [string, ...string[]]).optional(),
  // AI 제안 결정 기록 — 큐에서 빠지게 하는 상태 표시.
  suggestion: z.enum(["approved", "rejected", "no_article"]).optional(),
  problemId: z.string().uuid().optional(),
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
  if (!role) return data({ error: "Forbidden" }, { status: 403 });

  const fd = await request.formData();
  const parsed = schema.safeParse({
    refType: fd.get("refType"),
    refId: fd.get("refId"),
    oxTruth: fd.get("oxTruth") == null ? undefined : String(fd.get("oxTruth")),
    oxIneligible:
      fd.get("oxIneligible") == null ? undefined : String(fd.get("oxIneligible")),
    oxHidden:
      fd.get("oxHidden") == null ? undefined : String(fd.get("oxHidden")),
    relatedArticleNumber:
      fd.get("relatedArticleNumber") == null
        ? undefined
        : String(fd.get("relatedArticleNumber")).trim(),
    subject: fd.get("subject") == null ? undefined : String(fd.get("subject")),
    suggestion:
      fd.get("suggestion") == null ? undefined : String(fd.get("suggestion")),
    problemId:
      fd.get("problemId") == null ? undefined : String(fd.get("problemId")),
  });
  if (!parsed.success) {
    return data({ error: "Invalid input" }, { status: 400 });
  }

  // 조문 연결/해제 — subject 필수(조 번호 → article_id 해석에 필요).
  if (parsed.data.relatedArticleNumber !== undefined) {
    if (!parsed.data.subject) {
      return data({ error: "subject가 필요합니다" }, { status: 400 });
    }
    const res = await setOxItemArticle(
      client,
      parsed.data.subject as never,
      parsed.data.refType,
      parsed.data.refId,
      parsed.data.relatedArticleNumber === ""
        ? null
        : parsed.data.relatedArticleNumber,
    );
    if (!res.ok) return data({ error: res.error }, { status: 400 });
  }

  // AI 제안 결정 기록 — 큐 이탈용 상태. problemId·subject 는 제안 행이 없을 때의 insert 경로용.
  if (parsed.data.suggestion) {
    if (!parsed.data.problemId || !parsed.data.subject) {
      return data({ error: "problemId/subject가 필요합니다" }, { status: 400 });
    }
    await decideOxArticleSuggestion(
      parsed.data.refType,
      parsed.data.refId,
      parsed.data.problemId,
      parsed.data.subject,
      parsed.data.suggestion,
      user.id,
    );
  }

  const truth =
    parsed.data.oxTruth === undefined
      ? undefined
      : parsed.data.oxTruth === ""
        ? null
        : parsed.data.oxTruth;
  const ineligible =
    parsed.data.oxIneligible === undefined
      ? undefined
      : parsed.data.oxIneligible === "true";
  const hidden =
    parsed.data.oxHidden === undefined
      ? undefined
      : parsed.data.oxHidden === "true";

  await updateOxReviewItem(client, parsed.data.refType, parsed.data.refId, {
    oxTruth: truth,
    oxIneligible: ineligible,
    hidden,
    hiddenBy: hidden ? user.id : null,
  });

  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
