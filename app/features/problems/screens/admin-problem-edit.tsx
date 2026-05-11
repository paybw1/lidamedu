// 운영자 객관식 문제 편집 — 메타 (출처/유형/극성/연도/회차/scope) + 본문 + 5지문.

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  CircleSlashIcon,
  SaveIcon,
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

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
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
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import { getProblemById } from "~/features/problems/queries.server";

import type { Route } from "./+types/admin-problem-edit";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "문제 편집 | Lidam Edu" }];
  return [
    {
      title: `문제 #${loaderData.problem.problemNumber ?? "?"} 편집 | Lidam Edu`,
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
  return { problem };
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
    video_url: stringOrNull(fd.get("videoUrl")),
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

  return { ok: true, kind: andReview ? "save_and_review" : "save" } as const;
}

export default function AdminProblemEdit({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { problem } = loaderData;
  // 목록에서 편집 진입 시 따라오는 필터 쿼리를 보존해 ← 클릭 시 같은 필터 상태로 되돌린다.
  const [editSearchParams] = useSearchParams();
  const backQs = editSearchParams.toString();
  const backTo = backQs ? `/admin/problems?${backQs}` : "/admin/problems";
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
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={backTo}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> 객관식 문제 목록
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          편집
        </p>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {problem.primaryArticleLabel ?? "조문 미연결"}{" "}
            {problem.problemNumber ? (
              <span className="text-muted-foreground text-base font-normal">
                · 문제 #{problem.problemNumber}
              </span>
            ) : null}
          </h1>
          {problem.mismatchFlaggedAt ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangleIcon className="size-3" />
              재검토 필요 · {new Date(problem.mismatchFlaggedAt).toLocaleDateString("ko-KR")}
            </Badge>
          ) : problem.reviewedAt ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              검토 완료 · {new Date(problem.reviewedAt).toLocaleDateString("ko-KR")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              미검토
            </Badge>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {problem.reviewedAt ? (
          <reviewFetcher.Form method="post">
            <input type="hidden" name="intent" value="unreview" />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isReviewing}
              className="gap-1"
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
            className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircleIcon className="size-4" />
            {isSavingAndReviewing ? "처리 중…" : "검토 완료"}
          </Button>
        )}
        <mismatchFetcher.Form method="post">
          <input
            type="hidden"
            name="intent"
            value={problem.mismatchFlaggedAt ? "unflag_mismatch" : "flag_mismatch"}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={isFlagging}
            className={cn(
              "gap-1",
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
      </div>

      <Form method="post" id={FORM_ID} className="space-y-4">
        <input
          type="hidden"
          name="choiceCount"
          value={problem.choices.length}
        />

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
            <input
              name="videoUrl"
              type="url"
              maxLength={2000}
              defaultValue={problem.videoUrl ?? ""}
              placeholder="https://www.youtube.com/watch?v=…"
              className="border-input bg-background h-8 w-full rounded-md border px-2 text-xs"
              data-testid="problem-video-url"
            />
            <p className="text-muted-foreground mt-1 text-[11px]">
              빈 값으로 저장하면 학생 viewer 에서 동영상 풀이 버튼이 숨겨집니다.
            </p>
          </CardContent>
        </Card>

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
                  <Badge
                    variant="outline"
                    className="border-amber-500 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  >
                    미분류 {problem.unclassifiedChoices}
                  </Badge>
                ) : null}
                <button
                  type="button"
                  onClick={() => triggerBulkOx(true)}
                  className="border-input hover:bg-accent rounded-md border px-2 py-1 text-[11px] font-medium"
                  title="모든 지문/박스 항목의 OX 불가를 일괄 체크"
                >
                  전체 OX 불가
                </button>
                <button
                  type="button"
                  onClick={() => triggerBulkOx(false)}
                  className="text-muted-foreground hover:text-foreground rounded-md px-1.5 py-1 text-[11px]"
                  title="OX 불가 일괄 해제"
                >
                  해제
                </button>
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
          <Button
            type="submit"
            name="intent"
            value="save"
            disabled={isSaving}
            className="gap-1"
          >
            <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
          </Button>
        </div>
      </Form>

      <deleteFetcher.Form method="post" className="mt-6">
        <input type="hidden" name="intent" value="delete" />
        <button
          type="submit"
          disabled={isDeleting}
          onClick={(e) => {
            if (!confirm("이 문제를 삭제하시겠습니까? (soft delete)")) {
              e.preventDefault();
            }
          }}
          className="text-rose-600 text-xs hover:underline disabled:opacity-50"
        >
          {isDeleting ? "삭제 중…" : "문제 삭제"}
        </button>
      </deleteFetcher.Form>
    </div>
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
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <select
        name={name}
        {...(isControlled
          ? { value, onChange: (e) => onChange!(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        disabled={disabled}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        className="border-input bg-background h-9 rounded-md border px-2 text-sm disabled:opacity-50"
      />
    </label>
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
