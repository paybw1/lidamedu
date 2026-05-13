// 체계도 노드 상세 — 노드 subtree 안의 모든 문제를 article 별 그룹으로 묶어 한 화면에서 편집.
//
// 각 문제 카드는 자체 fetcher.Form 으로 /admin/problems/:problemId 의 action 에 POST.
// 동일 action 을 재사용해 메타/본문/지문/정답 동시 갱신.

import { AlertTriangleIcon, ArrowLeftIcon, SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, data, useFetcher } from "react-router";
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
  type ProblemDetail,
  type ProblemFormat,
  type ProblemOrigin,
  type ProblemPolarity,
  type ProblemScope,
} from "~/features/problems/labels";
import { getSystematicNodeProblems } from "~/features/problems/queries.server";

import type { Route } from "./+types/admin-problems-system-edit";

const ORIGINS: ProblemOrigin[] = ["past_exam", "past_exam_variant", "mock", "expected"];
const FORMATS: ProblemFormat[] = ["mc_short", "mc_box", "mc_case"];
const POLARITIES: ProblemPolarity[] = ["positive", "negative"];
const SCOPES: ProblemScope[] = ["unit", "comprehensive"];

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "체계 편집 | Lidam Edu" }];
  return [{ title: `${ld.result?.node.displayLabel ?? "체계"} | Lidam Edu` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const nodeId = params.nodeId;
  if (!nodeId) throw data("Missing nodeId", { status: 404 });
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) throw data("Forbidden", { status: 403 });
  const result = await getSystematicNodeProblems(client, nodeId);
  if (!result) throw data("Node not found", { status: 404 });
  const url = new URL(request.url);
  const subject = url.searchParams.get("subject") ?? "patent";
  return { result, subject };
}

export default function AdminProblemsSystemEdit({
  loaderData,
}: Route.ComponentProps) {
  const { result, subject } = loaderData;
  const totalProblems = result.articleGroups.reduce(
    (a, g) => a + g.problems.length,
    0,
  );
  return (
    <div className="mx-auto w-full max-w-screen-xl px-5 py-6 md:px-10 md:py-8">
      <Link
        to={`/admin/problems?subject=${subject}`}
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" /> 객관식 문제 관리
      </Link>
      <header className="mb-6 space-y-2">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          체계 편집
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{result.node.displayLabel}</h1>
        <p className="text-muted-foreground text-sm">
          조문 <span className="text-foreground font-bold">{result.articleGroups.length}</span>개
          · 문제 <span className="text-foreground font-bold">{totalProblems}</span>건
          {result.emptyArticles.length > 0 ? (
            <>
              {" "}· 문제 없는 조문{" "}
              <span className="text-foreground font-bold">{result.emptyArticles.length}</span>개
            </>
          ) : null}
        </p>
      </header>

      {result.articleGroups.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          이 체계에 매핑된 문제가 없습니다.
        </p>
      ) : (
        <div className="space-y-8">
          {result.articleGroups.map((g) => (
            <section key={g.articleId} className="scroll-mt-20" id={`article-${g.articleId}`}>
              <h2 className="bg-background sticky top-0 z-10 -mx-2 mb-3 border-b px-2 py-2 text-base font-semibold">
                {g.articleLabel}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  ({g.problems.length}건)
                </span>
              </h2>
              <div className="space-y-3">
                {g.problems.map((p) => (
                  <ProblemCard key={p.problemId} problem={p} />
                ))}
              </div>
            </section>
          ))}
          {result.emptyArticles.length > 0 ? (
            <section className="border-t pt-6">
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                문제 없는 조문 ({result.emptyArticles.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.emptyArticles.map((a) => (
                  <Badge key={a.articleId} variant="outline" className="text-[11px]">
                    {a.articleLabel}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProblemCard({ problem }: { problem: ProblemDetail }) {
  const fetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isSaving = fetcher.state !== "idle";
  const submittingIntent =
    fetcher.state !== "idle"
      ? String(fetcher.formData?.get("intent") ?? "")
      : null;
  const isSavingAndReviewing = submittingIntent === "save_and_review";
  const ad = fetcher.data;
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    if (!ad) return;
    if (ad.ok) {
      if (ad.kind === "save_and_review") {
        toast.success(`#${problem.problemNumber ?? "?"} 저장 + 검토 완료`);
        // 자동 저장 + 검토 완료 후 자동 접기.
        setCollapsed(true);
      } else if (ad.kind === "review") {
        toast.success(`#${problem.problemNumber ?? "?"} 검토 완료`);
      } else if (ad.kind === "unreview") {
        toast.success(`#${problem.problemNumber ?? "?"} 검토 취소`);
      } else {
        toast.success(`#${problem.problemNumber ?? "?"} 저장됨`);
      }
    } else if (ad.error) toast.error(ad.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad]);
  const reviewFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isReviewing = reviewFetcher.state !== "idle";
  const mismatchFetcher = useFetcher<{ ok?: boolean; kind?: string; error?: string }>();
  const isFlagging = mismatchFetcher.state !== "idle";
  const [correctIndex, setCorrectIndex] = useState<number>(
    problem.choices.find((c) => c.isCorrect)?.choiceIndex ?? 0,
  );
  // 자식 (ChoiceEditor / BoxItemEditor) 의 자동 OX·기본 종류는 메타에 의존 → lift 해서 저장 전에도 즉시 반영.
  const [origin, setOrigin] = useState<ProblemOrigin>(problem.origin);
  const [format, setFormat] = useState<ProblemFormat>(problem.format);
  const [polarity, setPolarity] = useState<ProblemPolarity | "">(
    problem.polarity ?? "",
  );
  // 전체 OX 불가 일괄 토글 신호 — 자식에 epoch 로 전파.
  const [bulkOxSignal, setBulkOxSignal] = useState<{
    epoch: number;
    ineligible: boolean;
  } | undefined>(undefined);
  const triggerBulkOx = (ineligible: boolean) =>
    setBulkOxSignal((prev) => ({
      epoch: (prev?.epoch ?? 0) + 1,
      ineligible,
    }));

  useEffect(() => {
    const r = reviewFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "review") {
      toast.success(`#${problem.problemNumber ?? "?"} 검토 완료`);
      // 검토 완료 후 자동 접기 — 운영자가 다음 문제로 빠르게 넘어갈 수 있도록.
      setCollapsed(true);
    } else if (r.ok && r.kind === "unreview") {
      toast.success(`#${problem.problemNumber ?? "?"} 검토 취소`);
    } else if (r.error) toast.error(r.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewFetcher.data]);
  useEffect(() => {
    const r = mismatchFetcher.data;
    if (!r) return;
    if (r.ok && r.kind === "flag_mismatch") {
      toast.success(`#${problem.problemNumber ?? "?"} 재검토 필요로 표시`);
      // 재검토 필요 표시도 검토 완료와 동일하게 자동 접기 — 다음 문제로 빠르게 이동.
      setCollapsed(true);
    } else if (r.ok && r.kind === "unflag_mismatch") {
      toast.success(`#${problem.problemNumber ?? "?"} 재검토 표시 취소`);
    } else if (r.error) toast.error(r.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mismatchFetcher.data]);

  const showRound = ORIGIN_HAS_ROUND[origin];

  return (
    <Card>
      <CardHeader className="px-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-[11px]">
              <Badge variant="outline" className="text-[10px]">
                {ORIGIN_LABEL[problem.origin]}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {FORMAT_LABEL[problem.format]}
              </Badge>
              {problem.polarity ? (
                <Badge variant="outline" className="text-[10px]">
                  {POLARITY_LABEL[problem.polarity]}
                </Badge>
              ) : null}
              {problem.scope ? (
                <Badge variant="outline" className="text-[10px]">
                  {SCOPE_LABEL[problem.scope]}
                </Badge>
              ) : null}
              {problem.year != null ? (
                <span className="tabular-nums">
                  {problem.year}
                  {problem.examRoundNo != null ? `-${problem.examRoundNo}` : ""}
                </span>
              ) : null}
              {problem.problemNumber != null ? (
                <span>#{problem.problemNumber}</span>
              ) : null}
              {problem.unclassifiedChoices > 0 ? (
                <Badge
                  variant="outline"
                  className="border-amber-500 bg-amber-50 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  미분류 {problem.unclassifiedChoices}
                </Badge>
              ) : null}
              {problem.mismatchFlaggedAt ? (
                <Badge className="bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangleIcon className="size-3" /> 재검토 필요
                </Badge>
              ) : problem.reviewedAt ? (
                <Badge className="bg-emerald-100 text-[10px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  검토 완료
                </Badge>
              ) : null}
            </div>
            <p className="line-clamp-2 text-sm">{problem.bodyMd}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {problem.reviewedAt ? (
              // 검토 취소 — 폼 데이터 저장 없이 reviewed_at 만 토글.
              <reviewFetcher.Form
                method="post"
                action={`/admin/problems/${problem.problemId}`}
              >
                <input type="hidden" name="intent" value="unreview" />
                <button
                  type="submit"
                  disabled={isReviewing}
                  className="border-input text-muted-foreground hover:bg-muted rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                >
                  {isReviewing ? "…" : "검토 취소"}
                </button>
              </reviewFetcher.Form>
            ) : !collapsed ? (
              // 펼쳐진 상태에서 검토 완료 → 메인 폼 자동 저장 + 검토 완료 표시 + 자동 접기.
              // form 속성으로 메인 fetcher.Form 을 가리켜 submit 을 위임한다.
              <button
                type="submit"
                form={`problem-form-${problem.problemId}`}
                name="intent"
                value="save_and_review"
                disabled={isSaving}
                className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {isSavingAndReviewing ? "…" : "검토 완료"}
              </button>
            ) : (
              // 접힌 상태(편집 안 한 상태)에서 검토 완료 → 단순 reviewFetcher 로 reviewed_at 만 표시.
              <reviewFetcher.Form
                method="post"
                action={`/admin/problems/${problem.problemId}`}
              >
                <input type="hidden" name="intent" value="review" />
                <button
                  type="submit"
                  disabled={isReviewing}
                  className="rounded-md border border-emerald-600 bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isReviewing ? "…" : "검토 완료"}
                </button>
              </reviewFetcher.Form>
            )}
            <mismatchFetcher.Form
              method="post"
              action={`/admin/problems/${problem.problemId}`}
            >
              <input
                type="hidden"
                name="intent"
                value={problem.mismatchFlaggedAt ? "unflag_mismatch" : "flag_mismatch"}
              />
              <button
                type="submit"
                disabled={isFlagging}
                title="문제와 해설이 매칭되지 않아 재검토가 필요할 때 표시"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                  problem.mismatchFlaggedAt
                    ? "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/20",
                )}
              >
                <AlertTriangleIcon className="size-3" />
                {isFlagging
                  ? "…"
                  : problem.mismatchFlaggedAt
                    ? "재검토 취소"
                    : "재검토 필요"}
              </button>
            </mismatchFetcher.Form>
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              {collapsed ? "펼치기" : "접기"}
            </button>
          </div>
        </div>
      </CardHeader>
      {!collapsed ? (
        <CardContent className="px-4 pb-4">
          <fetcher.Form
            method="post"
            action={`/admin/problems/${problem.problemId}`}
            id={`problem-form-${problem.problemId}`}
            className="space-y-3"
          >
            <input type="hidden" name="choiceCount" value={problem.choices.length} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <FormSelect
                name="origin"
                label="출처"
                value={origin}
                onChange={(v) => setOrigin(v as ProblemOrigin)}
                options={ORIGINS.map((v) => ({ value: v, label: ORIGIN_LABEL[v] }))}
              />
              <FormSelect
                name="format"
                label="유형"
                value={format}
                onChange={(v) => setFormat(v as ProblemFormat)}
                options={FORMATS.map((v) => ({ value: v, label: FORMAT_LABEL[v] }))}
              />
              <FormSelect
                name="polarity"
                label="극성"
                value={polarity}
                onChange={(v) => setPolarity(v as ProblemPolarity | "")}
                options={[
                  { value: "", label: "—" },
                  ...POLARITIES.map((v) => ({ value: v, label: POLARITY_LABEL[v] })),
                ]}
              />
              <FormSelect
                name="scope"
                label="단원/종합"
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
                placeholder="29 / 28의2 (비우면 미연결)"
              />
            </div>
            <Textarea
              name="bodyMd"
              defaultValue={problem.bodyMd}
              rows={3}
              className="font-mono text-sm"
            />
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                종합 해설 (Markdown · 표/그림 가능){problem.explanationMd ? ` · ${problem.explanationMd.length}자` : ""}
              </summary>
              <div className="mt-2">
                <ExplanationEditor defaultValue={problem.explanationMd ?? ""} rows={6} />
              </div>
            </details>
            <div className="flex items-center justify-end gap-2">
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
            {problem.boxItems.length > 0 ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                  박스 보기 ({problem.boxItems.length})
                </p>
                <input
                  type="hidden"
                  name="boxItemIds"
                  value={problem.boxItems.map((bi) => bi.boxItemId).join(",")}
                />
                {problem.boxItems.map((bi) => (
                  <BoxItemEditor
                    key={bi.boxItemId}
                    item={bi}
                    layout="compact"
                    polarity={polarity || null}
                    format={format}
                    correctChoiceBody={
                      problem.choices.find((c) => c.choiceIndex === correctIndex)?.bodyMd ?? null
                    }
                    bulkOxSignal={bulkOxSignal}
                  />
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              {problem.boxItems.length > 0 ? (
                <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                  지문 ({problem.choices.length})
                </p>
              ) : null}
              {problem.choices.map((c) => (
                <ChoiceEditor
                  key={c.choiceId}
                  choice={c}
                  selectedAsCorrect={correctIndex === c.choiceIndex}
                  onCorrect={() => setCorrectIndex(c.choiceIndex)}
                  layout="compact"
                  polarity={polarity || null}
                  format={format}
                  bulkOxSignal={bulkOxSignal}
                />
              ))}
            </div>
            <div className="flex items-center justify-end">
              <Button
                type="submit"
                name="intent"
                value="save"
                disabled={isSaving}
                size="sm"
                className="gap-1"
              >
                <SaveIcon className="size-4" /> {isSaving ? "저장 중…" : "저장"}
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      ) : null}
    </Card>
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
        className="border-input bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-50"
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
        className="border-input bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-50"
      />
    </label>
  );
}

