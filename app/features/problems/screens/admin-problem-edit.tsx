// 운영자 객관식 문제 편집 — 메타 (출처/유형/극성/연도/회차/scope) + 본문 + 5지문.

import {
  AlertTriangleIcon,
  CheckCircleIcon,
  CircleSlashIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useFetcher,
  useNavigation,
  useSearchParams,
} from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { runAfterResponse } from "~/core/lib/wait-until.server";
import { reindexProblems } from "~/features/ai-qna/lib/source-chunker.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import {
  AdminSelect,
  Chip,
  Field,
} from "~/features/admin/components/admin-ui";
import { getStaffRole } from "~/features/laws/queries.server";
import { BoxItemEditor } from "~/features/problems/components/box-item-editor";
import { ChoiceEditor } from "~/features/problems/components/choice-editor";
import { ExplanationEditor } from "~/features/problems/components/explanation-editor";
import {
  FORMAT_LABEL,
  ORIGIN_HAS_ROUND,
  ORIGIN_LABEL,
  POLARITY_LABEL,
  SCOPE_LABEL,
  type ProblemBoxItem,
  type ProblemChoice,
  type ProblemDetail,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import { getProblemById } from "~/features/problems/queries.server";

import type { Route } from "./+types/admin-problem-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 편집 | Lidam Patent Attorney Academy" }];
  return [
    {
      title: `문제 #${loaderData.problem.problemNumber ?? "?"} 편집 | Lidam Patent Attorney Academy`,
    },
  ];
};

const ORIGINS: ProblemOrigin[] = [
  "past_exam",
  "past_exam_variant",
  "mock",
  "expected",
];
const FORMATS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];
// header 의 검토완료 버튼이 form 속성으로 메인 폼을 가리키기 위한 고정 id.
const FORM_ID = "admin-problem-edit-form";

// returnTo 화이트리스트 — open-redirect 방지. admin-case-edit 의 safeReturnTo 와
// 동일 패턴. 우리 도메인 안의 안전 경로만 허용:
//   1) /admin/problems    — admin 목록·필터 보존 (?law=patent 등 query 포함)
//   2) /subjects/<slug>/problems/<uuid> — 학생/공개 문제 viewer (viewer "수정" 진입점)
function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//"))
    return "/admin/problems";
  if (/^\/admin\/problems(\/|\?|$)/.test(raw)) return raw;
  if (/^\/subjects\/[a-z_-]+\/problems\/[a-f0-9-]+(\?|#|$)/i.test(raw))
    return raw;
  return "/admin/problems";
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const problemId = params.problemId;
  if (!problemId) throw data("Missing problemId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const problem = await getProblemById(client, problemId);
  if (!problem) throw data("Problem not found", { status: 404 });
  // 체크리스트 위젯용 — 이 문제가 매핑된 mcq pack 목록 (학생 노출 경로 확인).
  const { data: packLinks } = await client
    .from("mcq_pack_problems")
    .select("pack_id, mcq_packs!inner(title, is_published)")
    .eq("problem_id", problemId);
  const mcqPacks = (packLinks ?? [])
    .filter((r) => r.mcq_packs != null)
    .map((r) => ({
      packId: r.pack_id,
      title: r.mcq_packs.title,
      isPublished: r.mcq_packs.is_published,
    }));
  return { problem, mcqPacks, role };
}

export async function action({ params, request }: Route.ActionArgs) {
  const problemId = params.problemId;
  if (!problemId) return { ok: false, error: "Missing problemId" } as const;
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" } as const;
  const role = await getStaffRole(client, user.id);
  if (!role) return { ok: false, error: "Forbidden" } as const;

  const fd = await request.formData();
  const intent = String(fd.get("intent") ?? "save");
  if (intent === "delete") {
    await client
      .from("problems")
      .update({ deleted_at: new Date().toISOString() })
      .eq("problem_id", problemId);
    throw redirect("/admin/problems");
  }
  if (intent === "review" || intent === "unreview") {
    // 검토 완료 표시 시 재검토 필요 플래그는 자동 해제 (의미 충돌 방지).
    const { error } = await client
      .from("problems")
      .update({
        reviewed_at: intent === "review" ? new Date().toISOString() : null,
        reviewed_by: intent === "review" ? user.id : null,
        ...(intent === "review"
          ? { mismatch_flagged_at: null, mismatch_flagged_by: null }
          : {}),
      })
      .eq("problem_id", problemId);
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: intent } as const;
  }
  if (intent === "flag_mismatch" || intent === "unflag_mismatch") {
    // 재검토 필요 플래그 시 검토 완료는 자동 해제.
    const flag = intent === "flag_mismatch";
    const { error } = await client
      .from("problems")
      .update({
        mismatch_flagged_at: flag ? new Date().toISOString() : null,
        mismatch_flagged_by: flag ? user.id : null,
        ...(flag ? { reviewed_at: null, reviewed_by: null } : {}),
      })
      .eq("problem_id", problemId);
    if (error) return { ok: false, error: error.message } as const;
    return { ok: true, kind: intent } as const;
  }
  if (intent === "sync_choice_articles") {
    // primary_article_id 를 모든 빈 related_article_id 의 choice / box_item 에 일괄 적용.
    // 운영자가 명시적으로 다른 article 을 지정한 항목은 보존 (NULL 인 것만 채움).
    const { data: cur } = await client
      .from("problems")
      .select(
        "primary_article_id, articles!primary_article_id(article_number)",
      )
      .eq("problem_id", problemId)
      .maybeSingle();
    const primaryArticleId = cur?.primary_article_id ?? null;
    const primaryArticleNumber = cur?.articles?.article_number ?? null;
    if (!primaryArticleId) {
      return {
        ok: false,
        error: "본문 조문(primary_article_id)이 설정되지 않았습니다.",
      } as const;
    }
    const [{ count: choicesUpdated }, { count: boxesUpdated }] =
      await Promise.all([
        client
          .from("problem_choices")
          .update(
            {
              related_article_id: primaryArticleId,
              related_article_number: primaryArticleNumber,
            },
            { count: "exact" },
          )
          .eq("problem_id", problemId)
          .is("related_article_id", null),
        client
          .from("problem_box_items")
          .update(
            {
              related_article_id: primaryArticleId,
              related_article_number: primaryArticleNumber,
            },
            { count: "exact" },
          )
          .eq("problem_id", problemId)
          .is("related_article_id", null),
      ]);
    return {
      ok: true,
      kind: intent,
      synced: (choicesUpdated ?? 0) + (boxesUpdated ?? 0),
    } as const;
  }

  // primary_article_id 변경: articleNumber 텍스트 ("29" / "28의2" / "" )를 받아 같은 law 의 articles 조회.
  // 빈 문자열이면 null 로 unset.
  // 단, 현재 연결된 article 이 article_number = NULL (예: 우산 article "실용신안법") 인 경우 폼 default 도
  // 빈 문자열이라 사용자의 명시적 의도와 구분되지 않는다 → 같은 상태(=빈 문자열)면 primary_article_id 를
  // 건드리지 않는다 (운영자가 다른 값으로 바꿨을 때만 변경).
  const articleNumberInput = stringOrNull(fd.get("articleNumber"));
  // 현재 problem 의 law_id + 현재 primary article 의 article_number 를 한 번에 가져온다.
  const { data: curProblem } = await client
    .from("problems")
    .select("law_id, primary_article_id, articles!primary_article_id(article_number)")
    .eq("problem_id", problemId)
    .maybeSingle();
  const currentArticleNumber: string | null =
    curProblem?.articles?.article_number ?? null;
  let primaryArticleIdUpdate: { primary_article_id: string | null } | null = null;
  if (fd.has("articleNumber")) {
    if (articleNumberInput == null) {
      // 현재 article_number 도 NULL 이면 default 값 그대로 제출된 것 — 변경 의도 아님.
      // 현재 article_number 가 있는데 비웠다면 명시적 unset 의도.
      if (currentArticleNumber != null) {
        primaryArticleIdUpdate = { primary_article_id: null };
      }
    } else if (articleNumberInput === currentArticleNumber) {
      // 동일한 값 → 변경 없음.
    } else {
      if (!curProblem?.law_id) {
        return { ok: false, error: "법령 정보 없음" } as const;
      }
      const { data: art } = await client
        .from("articles")
        .select("article_id")
        .eq("law_id", curProblem.law_id)
        .eq("article_number", articleNumberInput)
        .is("deleted_at", null)
        .maybeSingle();
      if (!art) {
        return {
          ok: false,
          error: `조문 "${articleNumberInput}" 을(를) 찾을 수 없습니다`,
        } as const;
      }
      primaryArticleIdUpdate = { primary_article_id: art.article_id };
    }
  }

  // 메타 + body 업데이트.
  // intent === "save_and_review" 인 경우 한 트랜잭션 안에서 검토 완료까지 같이 처리한다.
  const andReview = intent === "save_and_review";
  const update: Record<string, unknown> = {
    body_md: String(fd.get("bodyMd") ?? ""),
    explanation_md: stringOrNull(fd.get("explanationMd")),
    model_answer_md: stringOrNull(fd.get("modelAnswerMd")),
    grading_rubric_md: stringOrNull(fd.get("gradingRubricMd")),
    video_url: stringOrNull(fd.get("videoUrl")),
    subjective_kind: (() => {
      const v = stringOrNull(fd.get("subjectiveKind"));
      if (v === "case_based" || v === "theory" || v === "mixed") return v;
      return null;
    })(),
    subjective_keywords: (() => {
      const raw = stringOrNull(fd.get("subjectiveKeywords"));
      if (!raw) return null;
      const arr = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return arr.length > 0 ? arr : null;
    })(),
    subjective_topic: stringOrNull(fd.get("subjectiveTopic")),
    rubric_items: (() => {
      const raw = stringOrNull(fd.get("rubricItemsText"));
      if (!raw) return null;
      // 줄 단위 — "라벨 | 배점" 또는 "라벨 (배점)" 또는 "라벨, 배점".
      const items: { label: string; points: number }[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === "") continue;
        // 끝쪽에서 숫자 추출.
        const m = trimmed.match(/^(.*?)[\s|·,()\[\]]+(\d{1,3})\s*점?\s*\)?\s*$/);
        if (m) {
          const label = m[1].trim();
          const points = Number(m[2]);
          if (label.length > 0 && points >= 0 && points <= 100) {
            items.push({ label, points });
            continue;
          }
        }
        // 점수 없는 줄은 1점.
        items.push({ label: trimmed, points: 1 });
      }
      return items.length > 0 ? items : null;
    })(),
    origin: String(fd.get("origin") ?? "past_exam"),
    format: String(fd.get("format") ?? "mc_short"),
    polarity: stringOrNull(fd.get("polarity")),
    scope: stringOrNull(fd.get("scope")),
    year: numberOrNull(fd.get("year")),
    exam_round_no: numberOrNull(fd.get("examRoundNo")),
    problem_number: numberOrNull(fd.get("problemNumber")),
    updated_at: new Date().toISOString(),
    ...(primaryArticleIdUpdate ?? {}),
    ...(andReview
      ? {
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
          mismatch_flagged_at: null,
          mismatch_flagged_by: null,
        }
      : {}),
  };
  const { error: pErr } = await client
    .from("problems")
    .update(update)
    .eq("problem_id", problemId);
  if (pErr) return { ok: false, error: pErr.message } as const;

  // choices — 각 choice 별로 독립 update. correct_index + 관련 조문/판례.
  const correctIndex = numberOrNull(fd.get("correctIndex"));
  const choiceCount = numberOrNull(fd.get("choiceCount")) ?? 0;

  // 같은 law 의 article_number → article_id 매핑은 한 번만 가져온다.
  // 위에서 이미 curProblem.law_id 를 조회했으므로 재사용.
  const curLawId = curProblem?.law_id ?? null;
  const articleIdByNumber = new Map<string, string>();
  if (curLawId) {
    const { data: arts } = await client
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", curLawId)
      .is("deleted_at", null)
      .not("article_number", "is", null);
    for (const a of arts ?? []) {
      if (a.article_number) articleIdByNumber.set(a.article_number, a.article_id);
    }
  }

  for (let i = 1; i <= choiceCount; i++) {
    const choiceId = String(fd.get(`choice_${i}_id`) ?? "");
    if (!choiceId) continue;
    const choiceType = stringOrNull(fd.get(`choice_${i}_type`));
    const articleNumber = stringOrNull(fd.get(`choice_${i}_article_number`));
    const caseNumber = stringOrNull(fd.get(`choice_${i}_case_number`));
    const articleId = articleNumber ? articleIdByNumber.get(articleNumber) ?? null : null;
    const oxIneligibleSubmitted = fd.get(`choice_${i}_ox_ineligible`) === "1";
    const oxTruthRaw = stringOrNull(fd.get(`choice_${i}_ox_truth`));
    const oxTruth =
      oxIneligibleSubmitted ? null : oxTruthRaw === "O" || oxTruthRaw === "X" ? oxTruthRaw : null;
    const cUpdate: Record<string, unknown> = {
      body_md: String(fd.get(`choice_${i}_body`) ?? ""),
      explanation_md: stringOrNull(fd.get(`choice_${i}_explanation`)),
      choice_type: choiceType,
      is_correct: correctIndex === i,
      // 조문 ref: 어떤 type 이든 articleNumber 가 채워져 있으면 저장 (판례도 관련 조문을 함께 보관).
      related_article_number: articleNumber,
      related_article_id: articleId,
      // 판례번호는 precedent 일 때만 의미 있음.
      related_case_number: choiceType === "precedent" ? caseNumber : null,
      // OX 자동 연결 부적합 표기.
      ox_ineligible: oxIneligibleSubmitted,
      // 정/오 라벨 — 부적합이면 강제 null.
      ox_truth: oxTruth,
    };
    const { error: cErr } = await client
      .from("problem_choices")
      .update(cUpdate)
      .eq("choice_id", choiceId)
      .eq("problem_id", problemId);
    if (cErr) return { ok: false, error: cErr.message } as const;
  }

  // 박스 항목 update — boxItemIds 가 있는 경우.
  const boxItemIdsRaw = String(fd.get("boxItemIds") ?? "");
  if (boxItemIdsRaw) {
    const boxItemIds = boxItemIdsRaw.split(",").filter(Boolean);
    for (const id of boxItemIds) {
      const bChoiceType = stringOrNull(fd.get(`box_${id}_type`));
      const bArticleNumber = stringOrNull(fd.get(`box_${id}_article_number`));
      const bCaseNumber = stringOrNull(fd.get(`box_${id}_case_number`));
      const bArticleId = bArticleNumber ? articleIdByNumber.get(bArticleNumber) ?? null : null;
      const bOxIneligible = fd.get(`box_${id}_ox_ineligible`) === "1";
      const bOxTruthRaw = stringOrNull(fd.get(`box_${id}_ox_truth`));
      const bOxTruth = bOxIneligible
        ? null
        : bOxTruthRaw === "O" || bOxTruthRaw === "X"
          ? bOxTruthRaw
          : null;
      const bUpdate: Record<string, unknown> = {
        body_md: String(fd.get(`box_${id}_body`) ?? ""),
        explanation_md: stringOrNull(fd.get(`box_${id}_explanation`)),
        choice_type: bChoiceType,
        related_article_number: bArticleNumber,
        related_article_id: bArticleId,
        related_case_number: bChoiceType === "precedent" ? bCaseNumber : null,
        ox_ineligible: bOxIneligible,
        ox_truth: bOxTruth,
      };
      const { error: bErr } = await client
        .from("problem_box_items")
        .update(bUpdate)
        .eq("box_item_id", id)
        .eq("problem_id", problemId);
      if (bErr) return { ok: false, error: bErr.message } as const;
    }
  }

  // feat-9-001 RAG dirty hook — 문제 본문/보기/박스 변경 청크 재생성.
  runAfterResponse(reindexProblems([problemId]));
  // viewer "수정" 등 외부에서 진입한 경우 returnTo 가 form 에 carry 됨 — 저장 후
  // 본래 화면으로 복귀. 없으면 기존 동작 그대로 (같은 페이지 + toast).
  const returnToRaw = fd.get("returnTo");
  if (typeof returnToRaw === "string" && returnToRaw.trim() !== "") {
    throw redirect(safeReturnTo(returnToRaw));
  }
  return { ok: true, kind: andReview ? "save_and_review" : "save" } as const;
}

export default function AdminProblemEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { problem, mcqPacks, role } = loaderData;
  // 목록에서 편집 진입 시 따라오는 필터 쿼리를 보존해 ← 클릭 시 같은 필터 상태로 되돌린다.
  // viewer "수정" 진입은 ?returnTo=<viewer URL> 로 들어오는데, 이 경우 ← 가 그
  // viewer 로 복귀하도록 우선 적용 + form hidden 으로 carry 해 저장 후 redirect.
  const [editSearchParams] = useSearchParams();
  const returnTo = editSearchParams.get("returnTo");
  const backQs = editSearchParams.toString();
  const backTo = returnTo
    ? returnTo
    : backQs
      ? `/admin/problems?${backQs}`
      : "/admin/problems";
  // 메타 중 자식 (ChoiceEditor / BoxItemEditor) 의 자동 OX·기본 종류에 영향을 주는 값은 lift 해서
  // 저장 전에도 즉시 반영되게 한다. origin 은 showRound 토글에 사용.
  const [origin, setOrigin] = useState<ProblemOrigin>(problem.origin);
  const [format, setFormat] = useState<ProblemFormat>(problem.format);
  const [polarity, setPolarity] = useState<ProblemPolarity | "">(
    problem.polarity ?? "",
  );
  // 전체 OX 불가 일괄 체크/해제 — 자식 (ChoiceEditor / BoxItemEditor) 에 epoch 신호로 전파.
  const [bulkOxSignal, setBulkOxSignal] = useState<{
    epoch: number;
    ineligible: boolean;
  } | undefined>(undefined);
  const triggerBulkOx = (ineligible: boolean) =>
    setBulkOxSignal((prev) => ({
      epoch: (prev?.epoch ?? 0) + 1,
      ineligible,
    }));
  const showRound = ORIGIN_HAS_ROUND[origin];
  const correctIndex =
    problem.choices.find((c) => c.isCorrect)?.choiceIndex ?? 0;
  const navigation = useNavigation();
  const submittingIntent =
    navigation.state === "submitting"
      ? String(navigation.formData?.get("intent") ?? "")
      : null;
  const isSaving = submittingIntent === "save";
  const isSavingAndReviewing = submittingIntent === "save_and_review";
  const deleteFetcher = useFetcher();
  const isDeleting = deleteFetcher.state !== "idle";
  const reviewFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isReviewing = reviewFetcher.state !== "idle";
  useEffect(() => {
    const r = reviewFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "review") toast.success("검토 완료로 표시했습니다");
    else if (r.ok && r.kind === "unreview") toast.success("검토 표시를 취소했습니다");
    else if (r.error) toast.error(r.error);
  }, [reviewFetcher.data]);
  const mismatchFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isFlagging = mismatchFetcher.state !== "idle";
  useEffect(() => {
    const r = mismatchFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "flag_mismatch") toast.success("재검토 필요로 표시했습니다");
    else if (r.ok && r.kind === "unflag_mismatch") toast.success("재검토 표시를 취소했습니다");
    else if (r.error) toast.error(r.error);
  }, [mismatchFetcher.data]);
  const [selectedCorrect, setSelectedCorrect] = useState<number>(correctIndex);

  useEffect(() => {
    if (!actionData) return;
    if (actionData.ok) {
      const kind = "kind" in actionData ? actionData.kind : null;
      if (kind === "review") toast.success("검토 완료로 표시했습니다");
      else if (kind === "unreview") toast.success("검토 표시를 취소했습니다");
      else if (kind === "flag_mismatch") toast.success("재검토 필요로 표시했습니다");
      else if (kind === "unflag_mismatch") toast.success("재검토 표시를 취소했습니다");
      else if (kind === "save_and_review") toast.success("저장하고 검토 완료로 표시했습니다");
      else toast.success("저장되었습니다");
    } else if (actionData.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);
  return (
    <AdminShell
      cluster="problems"
      role={role}
      width={1040}
      title={
        <span className="inline-flex flex-wrap items-baseline gap-2">
          {problem.primaryArticleLabel ?? "조문 미연결"}
          {problem.problemNumber ? (
            <span className="text-muted-foreground text-base font-normal">
              · 문제 #{problem.problemNumber}
            </span>
          ) : null}
        </span>
      }
      desc="문제 메타·본문·지문·해설·관련 자료를 편집합니다. 저장하지 않은 변경 사항은 유실됩니다."
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          {problem.reviewedAt ? (
            <reviewFetcher.Form method="post">
              <input type="hidden" name="intent" value="unreview" />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isReviewing}
              >
                <CircleSlashIcon className="size-4" />
                {isReviewing ? "처리 중…" : "검토 표시 취소"}
              </Button>
            </reviewFetcher.Form>
          ) : (
            // 검토 완료 = 현재 폼 변경사항 자동 저장 + 검토 완료 표시.
            // form 속성으로 메인 form 을 가리켜 submit 을 위임한다.
            <Button
              type="submit"
              form={FORM_ID}
              name="intent"
              value="save_and_review"
              size="sm"
              disabled={isSavingAndReviewing || isSaving}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <CheckCircleIcon className="size-4" />
              {isSavingAndReviewing ? "처리 중…" : "검토 완료"}
            </Button>
          )}
          <mismatchFetcher.Form method="post">
            <input
              type="hidden"
              name="intent"
              value={
                problem.mismatchFlaggedAt ? "unflag_mismatch" : "flag_mismatch"
              }
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isFlagging}
              className={cn(
                problem.mismatchFlaggedAt
                  ? "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
                  : "border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/20",
              )}
              title="문제와 해설이 매칭되지 않아 재검토가 필요할 때 표시"
            >
              <AlertTriangleIcon className="size-4" />
              {isFlagging
                ? "처리 중…"
                : problem.mismatchFlaggedAt
                  ? "재검토 표시 취소"
                  : "재검토 필요"}
            </Button>
          </mismatchFetcher.Form>
          <Button
            type="submit"
            form={FORM_ID}
            name="intent"
            value="save"
            size="sm"
            disabled={isSaving}
          >
            <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      }
    >
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-xs"
      >
        ← 객관식 문제 목록
      </Link>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {problem.mismatchFlaggedAt ? (
          <Chip tone="amber">
            <AlertTriangleIcon className="size-3" />
            재검토 필요 ·{" "}
            {new Date(problem.mismatchFlaggedAt).toLocaleDateString("ko-KR")}
          </Chip>
        ) : problem.reviewedAt ? (
          <Chip tone="emerald">
            <CheckCircleIcon className="size-3" />
            검토 완료 ·{" "}
            {new Date(problem.reviewedAt).toLocaleDateString("ko-KR")}
          </Chip>
        ) : (
          <Chip tone="neutral">미검토</Chip>
        )}
      </div>

      <PublishChecklist problem={problem} mcqPacks={mcqPacks} />

      <Form method="post" id={FORM_ID} className="space-y-4">
        <input
          type="hidden"
          name="choiceCount"
          value={problem.choices.length}
        />
        {returnTo ? (
          <input type="hidden" name="returnTo" value={returnTo} />
        ) : null}

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              메타
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <FormSelect
              name="origin"
              label="출처"
              value={origin}
              onChange={(v) => setOrigin(v as ProblemOrigin)}
              options={ORIGINS.map((v) => ({
                value: v,
                label: ORIGIN_LABEL[v],
              }))}
            />
            <FormSelect
              name="format"
              label="유형"
              value={format}
              onChange={(v) => setFormat(v as ProblemFormat)}
              options={FORMATS.map((v) => ({
                value: v,
                label: FORMAT_LABEL[v],
              }))}
            />
            <FormSelect
              name="polarity"
              label="극성"
              value={polarity}
              onChange={(v) => setPolarity(v as ProblemPolarity | "")}
              options={[
                { value: "", label: "—" },
                ...POLARITIES.map((v) => ({
                  value: v,
                  label: POLARITY_LABEL[v],
                })),
              ]}
            />
            <FormSelect
              name="scope"
              label="단원 / 종합"
              defaultValue={problem.scope ?? ""}
              options={[
                { value: "", label: "—" },
                ...SCOPES.map((v) => ({ value: v, label: SCOPE_LABEL[v] })),
              ]}
            />
            <FormInput
              name="year"
              label="연도"
              type="number"
              defaultValue={problem.year ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="examRoundNo"
              label="회차"
              type="number"
              defaultValue={problem.examRoundNo ?? ""}
              disabled={!showRound}
            />
            <FormInput
              name="problemNumber"
              label="문제 번호"
              type="number"
              defaultValue={problem.problemNumber ?? ""}
            />
            <FormInput
              name="articleNumber"
              label="조문"
              defaultValue={problem.primaryArticleNumber ?? ""}
              placeholder="예: 29 / 28의2 (비우면 미연결)"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              본문
            </p>
          </CardHeader>
          <CardContent>
            <Textarea
              name="bodyMd"
              defaultValue={problem.bodyMd}
              rows={4}
              className="font-mono text-sm"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              종합 해설 (Markdown · 표/그림 가능)
            </p>
          </CardHeader>
          <CardContent>
            <ExplanationEditor defaultValue={problem.explanationMd ?? ""} rows={10} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              풀이 동영상 URL (강사 업로드 — 외부 링크)
            </p>
          </CardHeader>
          <CardContent>
            <Field hint="빈 값으로 저장하면 학생 viewer 에서 동영상 풀이 버튼이 숨겨집니다.">
              <Input
                name="videoUrl"
                type="url"
                maxLength={2000}
                defaultValue={problem.videoUrl ?? ""}
                placeholder="https://www.youtube.com/watch?v=…"
                data-testid="problem-video-url"
              />
            </Field>
          </CardContent>
        </Card>

        {format === "subjective" ? (
          <>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  주관식 분류 라벨
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Field label="유형" htmlFor="subjectiveKind">
                  <AdminSelect
                    id="subjectiveKind"
                    name="subjectiveKind"
                    defaultValue={problem.subjectiveKind ?? ""}
                    className="w-full"
                    data-testid="problem-subjective-kind"
                  >
                    <option value="">미지정</option>
                    <option value="case_based">사례형</option>
                    <option value="theory">논점형</option>
                    <option value="mixed">혼합형</option>
                  </AdminSelect>
                </Field>
                <Field label="주제(논점)" htmlFor="subjectiveTopic">
                  <Input
                    id="subjectiveTopic"
                    name="subjectiveTopic"
                    maxLength={200}
                    defaultValue={problem.subjectiveTopic ?? ""}
                    placeholder="예: 신규성 의제와 공지 예외의 관계"
                    data-testid="problem-subjective-topic"
                  />
                </Field>
                <Field
                  label="키워드 (콤마 구분)"
                  htmlFor="subjectiveKeywords"
                  className="sm:col-span-2"
                >
                  <Input
                    id="subjectiveKeywords"
                    name="subjectiveKeywords"
                    maxLength={500}
                    defaultValue={(problem.subjectiveKeywords ?? []).join(", ")}
                    placeholder="쉼표로 구분 — 예: 신규성, 공지예외, 우선권주장"
                    data-testid="problem-subjective-keywords"
                  />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  주관식 모범답안 (Markdown)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="modelAnswerMd"
                  rows={10}
                  defaultValue={problem.modelAnswerMd ?? ""}
                  placeholder="목차 + 본문 — 학생이 '모범답안 보기' 클릭 시 노출됩니다."
                  data-testid="problem-model-answer"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  채점 기준 (Markdown — 자유 기술)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="gradingRubricMd"
                  rows={6}
                  defaultValue={problem.gradingRubricMd ?? ""}
                  placeholder={
                    "자유 기술 — 학생에게 풀이 방향 안내용"
                  }
                  data-testid="problem-grading-rubric"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  채점 항목 체크리스트 (구조화 · 자기채점 UI)
                </p>
              </CardHeader>
              <CardContent>
                <Textarea
                  name="rubricItemsText"
                  rows={6}
                  defaultValue={(problem.rubricItems ?? [])
                    .map((it) => `${it.label} | ${it.points}`)
                    .join("\n")}
                  placeholder={
                    "한 줄에 하나씩 — '항목 | 배점' 형식\n예) 신규성 요건 정의 | 10\n공지 예외 사유 | 10\n사례 적용 | 10"
                  }
                  data-testid="problem-rubric-items"
                />
                <p className="text-muted-foreground mt-1 text-[11px]">
                  학생 viewer 에서 체크리스트로 변환되어 자기채점 점수 산출.
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}

        {problem.boxItems.length > 0 ? (
          <Card>
            <CardHeader>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                박스 보기 ({problem.boxItems.length})
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <input type="hidden" name="boxItemIds" value={problem.boxItems.map((bi) => bi.boxItemId).join(",")} />
              {problem.boxItems.map((bi) => (
                <BoxItemEditor
                  key={bi.boxItemId}
                  item={bi}
                  polarity={polarity || null}
                  format={format}
                  correctChoiceBody={
                    problem.choices.find((c) => c.choiceIndex === selectedCorrect)?.bodyMd ?? null
                  }
                  bulkOxSignal={bulkOxSignal}
                />
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                지문 ({problem.choices.length}){problem.boxItems.length > 0 ? ` + 박스 보기 (${problem.boxItems.length})` : ""}
              </p>
              <div className="flex items-center gap-2">
                {problem.unclassifiedChoices > 0 ? (
                  <Chip tone="amber">미분류 {problem.unclassifiedChoices}</Chip>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => triggerBulkOx(true)}
                  title="모든 지문/박스 항목의 OX 불가를 일괄 체크"
                >
                  전체 OX 불가
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => triggerBulkOx(false)}
                  title="OX 불가 일괄 해제"
                >
                  해제
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {problem.choices.map((c) => (
              <ChoiceEditor
                key={c.choiceId}
                choice={c}
                selectedAsCorrect={c.choiceIndex === selectedCorrect}
                onCorrect={() => setSelectedCorrect(c.choiceIndex)}
                polarity={polarity || null}
                format={format}
                bulkOxSignal={bulkOxSignal}
              />
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end">
          <Button type="submit" name="intent" value="save" disabled={isSaving}>
            <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Form>

      <div className="border-border/60 mt-8 flex items-center justify-between gap-3 border-t pt-5">
        <p className="text-muted-foreground text-[11px]">
          삭제는 soft delete 로 처리되며 학생 화면에서 즉시 숨겨집니다.
        </p>
        <deleteFetcher.Form method="post">
          <input type="hidden" name="intent" value="delete" />
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={(e) => {
              if (!confirm("이 문제를 삭제하시겠습니까? (soft delete)")) {
                e.preventDefault();
              }
            }}
          >
            <Trash2Icon className="size-4" />
            {isDeleting ? "삭제 중…" : "문제 삭제"}
          </Button>
        </deleteFetcher.Form>
      </div>
    </AdminShell>
  );
}

function FormSelect({
  name,
  label,
  defaultValue,
  value,
  onChange,
  options,
  disabled,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  const isControlled = value !== undefined && onChange !== undefined;
  return (
    <Field label={label} htmlFor={name}>
      <AdminSelect
        id={name}
        name={name}
        {...(isControlled
          ? { value, onChange: (e) => onChange!(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        disabled={disabled}
        className="w-full disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </AdminSelect>
    </Field>
  );
}

function FormInput({
  name,
  label,
  type = "text",
  defaultValue,
  disabled,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue: string | number;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={name}>
      <Input
        id={name}
        type={type}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
      />
    </Field>
  );
}


function stringOrNull(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 출제 마무리 체크리스트 — 학생 노출 경로(과목 hub / 조문 OX 위젯 / 최신 정보 mcq pack)가
// 모두 연결되어 있는지 한눈에 확인 + 부족한 부분을 한 번에 보강할 수 있는 액션 제공.
function PublishChecklist({
  problem,
  mcqPacks,
}: {
  problem: ProblemDetail;
  mcqPacks: ReadonlyArray<{ packId: string; title: string; isPublished: boolean }>;
}) {
  const isMcq =
    problem.format === "mc_short" ||
    problem.format === "mc_box" ||
    problem.format === "mc_case";
  // mc_box 는 box 지문이 OX 후보, 그 외 mc 계열은 choices.
  // ChoiceEditor/BoxItemEditor 가 노출하는 동일 필드(relatedArticleId, oxTruth, oxIneligible)만
  // 정규화해서 OX 위젯 노출 조건을 한 곳에서 평가한다.
  type OxCandidate = {
    relatedArticleId: string | null;
    oxTruth: ProblemChoice["oxTruth"];
  };
  const oxCandidates: OxCandidate[] = !isMcq
    ? []
    : problem.format === "mc_box"
      ? problem.boxItems
          .filter((b: ProblemBoxItem) => !b.oxIneligible)
          .map((b: ProblemBoxItem) => ({
            relatedArticleId: b.relatedArticleId,
            oxTruth: b.oxTruth,
          }))
      : problem.choices
          .filter((c: ProblemChoice) => !c.oxIneligible)
          .map((c: ProblemChoice) => ({
            relatedArticleId: c.relatedArticleId,
            oxTruth: c.oxTruth,
          }));
  const oxMissingArticleCount = oxCandidates.filter(
    (c) => c.relatedArticleId === null,
  ).length;
  const oxMissingTruthCount = oxCandidates.filter(
    (c) => c.oxTruth === null,
  ).length;
  const oxReadyCount = oxCandidates.filter(
    (c) => c.relatedArticleId !== null && c.oxTruth !== null,
  ).length;

  const hasPrimary = problem.primaryArticleId !== null;
  const correctChoice = isMcq
    ? problem.choices.find((c) => c.isCorrect) ?? null
    : null;
  const hasCorrect = !isMcq || correctChoice !== null;

  const syncFetcher = useFetcher<{
    ok?: boolean;
    kind?: string;
    synced?: number;
    error?: string;
  }>();
  useEffect(() => {
    const r = syncFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "sync_choice_articles") {
      toast.success(`본문 조문으로 ${r.synced ?? 0}개 항목을 자동 채움`);
    } else if (r.error) {
      toast.error(r.error);
    }
  }, [syncFetcher.data]);
  const isSyncing = syncFetcher.state !== "idle";

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <h2 className="text-sm font-semibold">출제 마무리 체크리스트</h2>
        <p className="text-muted-foreground text-[11px]">
          이 항목을 모두 채워야 학생 화면(과목 hub · 조문 OX 위젯 · 최신 정보 mcq)에 정상 노출됩니다.
        </p>
      </CardHeader>
      <CardContent className="grid gap-1.5 text-xs">
        <ChecklistRow
          state={hasPrimary ? "ok" : "warn"}
          label="본문 조문"
          detail={
            hasPrimary
              ? `${problem.primaryArticleLabel} 와 연결됨`
              : "미설정 — 아래 '관련 조문' 영역에 조문번호 입력"
          }
        />
        {isMcq ? (
          <ChecklistRow
            state={hasCorrect ? "ok" : "warn"}
            label="객관식 정답"
            detail={
              hasCorrect && correctChoice
                ? `${correctChoice.choiceIndex}번이 정답`
                : "미설정 — 지문 카드에서 정답 선택"
            }
          />
        ) : null}
        {isMcq ? (
          <ChecklistRow
            state={
              oxCandidates.length === 0
                ? "na"
                : oxMissingArticleCount === 0 && oxMissingTruthCount === 0
                  ? "ok"
                  : "warn"
            }
            label="조문 OX 위젯 노출"
            detail={
              oxCandidates.length === 0
                ? "OX 후보 지문 없음 (모두 OX 불가로 처리됨)"
                : oxMissingArticleCount > 0 || oxMissingTruthCount > 0
                  ? `노출 가능 ${oxReadyCount}/${oxCandidates.length} · 미분류: 조문 ${oxMissingArticleCount}개 · 정오(O/X) ${oxMissingTruthCount}개`
                  : `${oxCandidates.length}개 지문 모두 학생 OX 위젯에 노출 가능`
            }
            action={
              hasPrimary && oxMissingArticleCount > 0 ? (
                <syncFetcher.Form method="post">
                  <input
                    type="hidden"
                    name="intent"
                    value="sync_choice_articles"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={isSyncing}
                    className="h-7 px-2 text-[11px]"
                  >
                    {isSyncing ? "동기화 중…" : "본문 조문으로 일괄 채우기"}
                  </Button>
                </syncFetcher.Form>
              ) : null
            }
          />
        ) : null}
        {isMcq ? (
          <ChecklistRow
            state={mcqPacks.length > 0 ? "ok" : "warn"}
            label="최신 정보 mcq pack"
            detail={
              mcqPacks.length === 0
                ? "등록된 pack 없음 — '최신 정보 → 객관식 문제' 진입 경로가 없습니다"
                : `${mcqPacks.length}개 pack 매핑 · 공개 ${mcqPacks.filter((p) => p.isPublished).length}개`
            }
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  state,
  label,
  detail,
  action,
}: {
  state: "ok" | "warn" | "na";
  label: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const icon =
    state === "ok" ? (
      <CheckCircleIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
    ) : state === "warn" ? (
      <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
    ) : (
      <CircleSlashIcon className="text-muted-foreground size-4" />
    );
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 leading-relaxed">
        <span className="font-semibold">{label}</span>
        <span className="text-muted-foreground"> — {detail}</span>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
