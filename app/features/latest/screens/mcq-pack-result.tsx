// MCQ 팩 응시 결과 통계 (feat-3-303).
// KPI 4 + 동영상 배너 + 유형/지문별 정답률 + 문제별 결과 테이블.
// 키트 lidam-latest/McqResultScreen 디자인.

import {
  CheckCircle2Icon,
  CircleXIcon,
  ClockIcon,
  ExternalLinkIcon,
  MinusCircleIcon,
  RotateCcwIcon,
  ScrollTextIcon,
  VideoIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import { IndexCard, Pill } from "~/features/latest/components/latest-list";
import { McqAreaShell } from "~/features/mcq-packs/components/mcq-area-shell";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  CHOICE_TYPE_LABEL,
  FORMAT_LABEL,
  type ProblemChoiceType,
  type ProblemFormat,
} from "~/features/problems/labels";
import {
  getPackAttemptRanking,
  getPackById,
  getPackResultStats,
  type PackAttemptRanking,
} from "~/features/mcq-packs/queries.server";
import { isMockKind, MCQ_PACK_KIND_LABELS } from "~/features/mcq-packs/labels";
import { requireFeature } from "~/features/subscriptions/queries.server";
import {
  getEvidenceForWrongProblems,
  getPreviousPackScores,
  getProblemStatsBulk,
  getQuizSessionResult,
  getSessionWeakNodes,
  type PreviousScoreRow,
  type WeakNodeRow,
  type WrongEvidence,
} from "~/features/study/queries.server";

import type { Route } from "./+types/mcq-pack-result";

export const meta: Route.MetaFunction = ({ data: d }) => {
  if (!d || !d.pack) return [{ title: "응시 결과 | 리담변리사학원" }];
  return [{ title: `${d.pack.title} 응시 결과 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.packId || !params.sessionId) {
    throw data("Missing id", { status: 404 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const pack = await getPackById(client, params.packId);
  if (!pack) throw data("Pack not found", { status: 404 });
  // feat-8-008: 모의고사 종류 팩은 area_mock_exams 게이트 (회원3 / staff 면제).
  if (isMockKind(pack.kind)) {
    await requireFeature(client, user.id, "area_mock_exams");
  }

  const result = await getQuizSessionResult(client, user.id, params.sessionId);
  if (!result) throw data("Session not found", { status: 404 });

  const aggMap = await getProblemStatsBulk(
    client,
    result.items.map((it) => it.problemId),
  );
  const aggStats: Record<
    string,
    { attempts: number; accuracyPct: number | null }
  > = {};
  for (const [pid, s] of aggMap) {
    aggStats[pid] = {
      attempts: s.attempts,
      accuracyPct: s.accuracyPct,
    };
  }

  const packStats = await getPackResultStats(
    client,
    params.packId,
    params.sessionId,
    user.id,
  );
  // feat-10-004 — 본인 점수·합격·등수 (exam 모드 응시 시에만 row 존재)
  const ranking = await getPackAttemptRanking(client, params.packId);

  // feat §B1 — 오답들의 근거 재료 bulk 추출 (AI source → choice ref → box ref → primary).
  const wrongIds = result.items
    .filter((it) => it.isCorrect === false)
    .map((it) => it.problemId);
  const [evidenceByProblem, weakNodes, previousScores] = await Promise.all([
    getEvidenceForWrongProblems(client, user.id, params.sessionId, wrongIds),
    // §B3 약점 진단 — 단원별 정답률.
    getSessionWeakNodes(client, user.id, params.sessionId),
    // §B4 성장 추이 — 같은 pack 본인 이전 응시 점수.
    getPreviousPackScores(client, user.id, params.packId, params.sessionId, 5),
  ]);

  return {
    pack,
    result,
    aggStats,
    packStats,
    ranking,
    evidenceByProblem,
    weakNodes,
    previousScores,
  };
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function pct(correct: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((correct / total) * 100)}%`;
}

const FORMAT_ORDER: ProblemFormat[] = [
  "mc_short",
  "mc_box",
  "mc_case",
  "ox",
  "blank",
  "subjective",
];

// feat §B3 — pack.subjectScope → /subjects/* lawCode. industrial(혼합) / science 는 null.
function packSubjectToLawCode(s: string): string | null {
  if (s === "patent" || s === "trademark" || s === "design" || s === "civil")
    return s;
  if (s === "civil_procedure") return "civil-procedure";
  return null;
}

const CHOICE_TYPE_ORDER: ProblemChoiceType[] = ["statute", "precedent", "theory"];

export default function McqPackResult({ loaderData }: Route.ComponentProps) {
  const {
    pack,
    result,
    aggStats,
    packStats,
    ranking,
    evidenceByProblem,
    weakNodes,
    previousScores,
  } = loaderData;
  const { items, attemptedCount, correctCount, totalTimeMs } = result;
  const total = items.length;
  const wrongCount = attemptedCount - correctCount;
  const skipped = total - attemptedCount;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  return (
    <McqAreaShell
      isMock={isMockKind(pack.kind)}
      width="index"
      backLink={{
        to: `/latest/mcq/${pack.packId}`,
        label: "문제집으로 돌아가기",
      }}
      title={`${pack.title} — 응시 결과`}
      desc={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Pill tone="outline">{MCQ_PACK_KIND_LABELS[pack.kind]}</Pill>
          {result.session.completedAt ? (
            <Pill tone="emerald">제출 완료</Pill>
          ) : (
            <Pill tone="amber">진행 중 (저장됨)</Pill>
          )}
        </span>
      }
    >
      {ranking ? (
        <ScoreSummary
          ranking={ranking}
          passScore={pack.passScore}
          previousScores={previousScores}
        />
      ) : null}

      {/* feat §B3 — 단원별 정답률 (약점 단원 강조). */}
      {(() => {
        const lawCode = packSubjectToLawCode(pack.subjectScope);
        if (!lawCode) return null;
        return <WeakNodesPanel weakNodes={weakNodes} lawCode={lawCode} />;
      })()}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="본인 정답률"
          value={`${accuracyPct}%`}
          hint={`정답 ${correctCount} / 응답 ${attemptedCount}`}
          tone="primary"
        />
        <KpiCard
          label="총 문항"
          value={`${total}`}
          hint={skipped > 0 ? `미응답 ${skipped}` : "전부 응답"}
        />
        <KpiCard label="오답" value={`${wrongCount}`} hint="틀린 문항" />
        <KpiCard
          label="소요 시간"
          value={totalTimeMs > 0 ? formatDuration(totalTimeMs) : "—"}
          hint="응답 합계"
          icon={<ClockIcon className="size-3" />}
        />
      </div>

      {pack.videoUrl ? (
        <div className="border-primary/15 bg-primary/[0.06] mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
          <p className="text-sm font-medium">
            강사 풀이 동영상이 등록되어 있습니다.
          </p>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-9 rounded-full"
          >
            <a href={pack.videoUrl} target="_blank" rel="noreferrer">
              <VideoIcon className="size-3.5" /> 동영상 풀이 보기 →
            </a>
          </Button>
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <AccuracyTable
          title="유형별 정답률"
          caption="단답형 / 박스형 / 사례형 — 본인 vs 전체 평균"
          headLabel="유형"
          rows={FORMAT_ORDER.map((fmt) => ({
            key: fmt,
            label: FORMAT_LABEL[fmt],
            user: packStats?.sessionUserStats.byFormat[fmt],
            agg: packStats?.sessionAggStats.byFormat[fmt],
          }))}
        />
        <AccuracyTable
          title="지문별 정답률"
          caption="조문 / 판례 / 이론(실무) — 본인이 선택한 지문 기준"
          headLabel="지문 유형"
          rows={CHOICE_TYPE_ORDER.map((ct) => ({
            key: ct,
            label: CHOICE_TYPE_LABEL[ct],
            user: packStats?.sessionUserStats.byChoiceType[ct],
            agg: packStats?.sessionAggStats.byChoiceType[ct],
          }))}
        />
      </div>

      {/* feat §B2 — 오답 묶기 재도전 액션 + (향후) SRS 자리. */}
      {wrongCount > 0 ? (
        <div className="border-border bg-card mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-tight">
              오답 {wrongCount}문항 묶어 다시 풀기
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              이번 회차 오답만 모아 새 회차로. 같은 문제·같은 순서.
            </p>
          </div>
          <Form
            method="post"
            action="/api/study/session-from-attempts"
            className="flex gap-2"
          >
            <input
              type="hidden"
              name="sourceSessionId"
              value={result.session.sessionId}
            />
            <input type="hidden" name="mode" value="study" />
            <Button
              type="submit"
              variant="default"
              size="sm"
              className="rounded-full"
              data-testid="result-retry-wrong"
            >
              <RotateCcwIcon className="size-3.5" /> 오답 재도전
            </Button>
          </Form>
        </div>
      ) : null}

      <p className="mb-2 text-sm font-bold tracking-tight">
        문제별 결과
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          클릭하면 문제·정답·해설을 다시 볼 수 있습니다.
        </span>
      </p>
      <IndexCard>
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-border bg-muted/60 border-b">
              {["No", "정오", "출처", "본문", "본인", "전체", "시간"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "text-muted-foreground px-3 py-3 font-mono text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap uppercase",
                      i >= 4 ? "text-right" : i <= 1 ? "text-center" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const agg = aggStats[it.problemId];
              return (
                <tr
                  key={it.problemId}
                  className="border-border/60 hover:bg-muted/40 border-b transition-colors"
                >
                  <td className="text-muted-foreground px-3 py-3 text-center text-[13px] tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ResultIcon isCorrect={it.isCorrect} />
                  </td>
                  <td className="px-3 py-3 text-[13px] tabular-nums">
                    {it.year
                      ? `${it.year}${it.problemNumber ? ` · ${it.problemNumber}번` : ""}`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-[13px]">
                    <span className="line-clamp-1">{it.bodySnippet}</span>
                  </td>
                  <td
                    className={cn(
                      "px-3 py-3 text-right text-[13px] tabular-nums",
                      it.isCorrect
                        ? "text-emerald-600"
                        : it.isCorrect === false
                          ? "text-rose-600"
                          : "text-muted-foreground",
                    )}
                  >
                    {it.selectedChoiceIndex
                      ? `${it.selectedChoiceIndex}번`
                      : "미응답"}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-right text-[13px] tabular-nums">
                    {agg && agg.accuracyPct !== null
                      ? `${agg.accuracyPct}% (${agg.attempts})`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-right text-[13px] tabular-nums">
                    {it.timeSpentMs ? formatDuration(it.timeSpentMs) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </IndexCard>

      {/* feat §B1 — 오답별 근거 바로가기 (조문/판례 chip + AI 근거 청크 + 해설). */}
      {wrongCount > 0 ? (
        <>
          <p className="mt-6 mb-2 text-sm font-bold tracking-tight">
            오답별 근거 바로가기
            <span className="text-muted-foreground ml-2 text-xs font-normal">
              틀린 문제의 근거 조문·판례로 즉시 이동하세요.
            </span>
          </p>
          <ul className="space-y-2.5">
            {items
              .map((it, idx) => ({ it, idx: idx + 1 }))
              .filter(({ it }) => it.isCorrect === false)
              .map(({ it, idx }) => (
                <li key={it.problemId}>
                  <WrongEvidenceCard
                    item={it}
                    seqNo={idx}
                    evidence={evidenceByProblem[it.problemId]}
                  />
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </McqAreaShell>
  );
}

function WrongEvidenceCard({
  item,
  seqNo,
  evidence,
}: {
  item: import("~/features/study/queries.server").QuizSessionResultItem;
  seqNo: number;
  evidence: WrongEvidence | undefined;
}) {
  const hasEvidence =
    evidence &&
    (evidence.articles.length > 0 ||
      evidence.cases.length > 0 ||
      evidence.aiChunks.length > 0 ||
      evidence.explanationMd);
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <span className="bg-rose-100 text-rose-700 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums dark:bg-rose-950/40 dark:text-rose-300">
          {seqNo}
        </span>
        <Pill tone="rose">오답</Pill>
        {item.year ? (
          <span className="text-muted-foreground text-[11px] tabular-nums">
            {item.year}년
            {item.problemNumber ? ` · ${item.problemNumber}번` : ""}
          </span>
        ) : null}
        <span className="text-muted-foreground ml-2 line-clamp-1 flex-1 text-xs">
          {item.bodySnippet}
        </span>
      </div>

      {!hasEvidence ? (
        <p className="text-muted-foreground text-xs">
          근거 정보가 없습니다. 강사 Q&amp;A 또는 해설을 참고하세요.
        </p>
      ) : (
        <div className="space-y-2">
          {evidence!.articles.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                조문
              </span>
              {evidence!.articles.map((a) => (
                <Link
                  key={`${a.articleId}-${a.via}`}
                  to={`/subjects/${a.lawCode}/articles/${a.pathSlug}`}
                  viewTransition
                  prefetch="intent"
                  title={a.via}
                  className="border-primary/30 bg-primary/[0.08] text-link hover:bg-primary/[0.15] inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs"
                >
                  <ScrollTextIcon className="size-3" />
                  {a.displayLabel}
                  <span className="text-muted-foreground/80 ml-0.5 text-[10px]">
                    {a.via}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {evidence!.cases.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
                판례
              </span>
              {evidence!.cases.map((c) => (
                <Link
                  key={`${c.caseId}-${c.via}`}
                  to={`/subjects/${c.lawCode}/cases/${c.caseId}`}
                  viewTransition
                  prefetch="intent"
                  title={c.via}
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-violet-300/50 bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-700/40 dark:bg-violet-950/30 dark:text-violet-300"
                >
                  <ExternalLinkIcon className="size-3" />
                  {c.caseNumber}
                  <span className="text-muted-foreground/80 ml-0.5 text-[10px]">
                    {c.via}
                  </span>
                </Link>
              ))}
            </div>
          ) : null}
          {evidence!.aiChunks.length > 0 ? (
            <div className="border-border/60 mt-1 rounded-md border bg-muted/30 p-2">
              <p className="text-muted-foreground mb-1 text-[10px] font-bold tracking-wide uppercase">
                AI 근거 청크 ({evidence!.aiChunks.length})
              </p>
              <ul className="space-y-1">
                {evidence!.aiChunks.slice(0, 2).map((ch) => (
                  <li key={ch.chunkId} className="text-xs">
                    <span className="text-muted-foreground mr-1.5 text-[10px]">
                      [{ch.sourceType}
                      {ch.headingPath ? ` · ${ch.headingPath}` : ""}]
                    </span>
                    {ch.bodyPreview}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {evidence!.explanationMd ? (
            <details className="text-xs">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] font-semibold">
                해설 보기
              </summary>
              <p className="text-foreground/80 mt-1.5 whitespace-pre-line">
                {evidence!.explanationMd}
              </p>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}

// feat-10-004 — 모의고사 점수·합격 판정·등수 요약.
// feat §B4 — 합격선까지 N점 / 지난 회차 ± 추이 추가.
function ScoreSummary({
  ranking,
  passScore,
  previousScores,
}: {
  ranking: PackAttemptRanking;
  passScore: number | null;
  previousScores: PreviousScoreRow[];
}) {
  const passed = passScore !== null ? ranking.score >= passScore : null;
  const distanceToPass = passScore !== null ? passScore - ranking.score : null;
  const lastPrev = previousScores[0] ?? null;
  const diffPrev = lastPrev ? ranking.score - lastPrev.score : null;
  return (
    <div className="border-border bg-card mb-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
          점수
        </span>
        <span className="text-link text-4xl font-extrabold tabular-nums">
          {ranking.score}
        </span>
        <span className="text-muted-foreground text-sm">/ 100점</span>
        {passed === true ? (
          <Pill tone="emerald">합격</Pill>
        ) : passed === false ? (
          <Pill tone="rose">불합격</Pill>
        ) : null}
        <span className="text-muted-foreground text-xs tabular-nums">
          정답 {ranking.correct} / {ranking.total}
          {passScore !== null ? ` · 합격선 ${passScore}점` : ""}
        </span>
        {/* §B4 — 합격선까지 N점 (이번 점수 기준). */}
        {distanceToPass !== null && distanceToPass > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            합격까지 {distanceToPass}점
          </span>
        ) : distanceToPass !== null && distanceToPass <= 0 ? (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            합격선 +{Math.abs(distanceToPass)}점
          </span>
        ) : null}
        {/* §B4 — 지난 회차 대비 ±. */}
        {diffPrev !== null ? (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              diffPrev > 0
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : diffPrev < 0
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                  : "bg-muted text-muted-foreground",
            )}
          >
            지난 회차 {diffPrev > 0 ? "+" : ""}
            {diffPrev}점
          </span>
        ) : null}
      </div>
      <div className="text-right">
        <p className="text-lg font-bold tabular-nums">
          전체 {ranking.totalTakers}명 중{" "}
          <span className="text-link">{ranking.rank}등</span>
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          백분위 {ranking.percentile} · 표준점수 z {ranking.zScore}
        </p>
      </div>
    </div>
  );
}

// feat §B3 — 약점 단원 패널. 정답률 오름차순 상위 5개.
function WeakNodesPanel({
  weakNodes,
  lawCode,
}: {
  weakNodes: WeakNodeRow[];
  lawCode: string;
}) {
  if (weakNodes.length === 0) return null;
  const top = weakNodes.slice(0, 5);
  return (
    <div className="border-border bg-card mb-4 rounded-2xl border p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold tracking-tight">단원별 정답률</p>
        <p className="text-muted-foreground text-[11px]">
          정답률 낮은 순 · 약점 단원 우선
        </p>
      </div>
      <ul className="space-y-1.5">
        {top.map((n, idx) => {
          const tone =
            n.accuracyPct < 50
              ? "rose"
              : n.accuracyPct < 75
                ? "amber"
                : "emerald";
          return (
            <li
              key={n.nodeId ?? `etc-${idx}`}
              className="border-border/70 flex items-center gap-3 rounded-md border bg-background px-3 py-2"
            >
              <span
                className={cn(
                  "inline-block size-2 shrink-0 rounded-full",
                  tone === "rose"
                    ? "bg-rose-500"
                    : tone === "amber"
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
              />
              <div className="min-w-0 flex-1">
                {n.nodeId ? (
                  <Link
                    to={`/subjects/${lawCode}/systematic/${n.nodeId}`}
                    viewTransition
                    prefetch="intent"
                    className="hover:text-link text-sm font-medium"
                  >
                    {n.label}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{n.label}</span>
                )}
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                {n.correct}/{n.total}
              </span>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  tone === "rose"
                    ? "text-rose-600"
                    : tone === "amber"
                      ? "text-amber-600"
                      : "text-emerald-600",
                )}
              >
                {n.accuracyPct}%
              </span>
            </li>
          );
        })}
      </ul>
      {weakNodes[0] && weakNodes[0].accuracyPct < 60 ? (
        <p className="text-muted-foreground mt-2 text-[11px]">
          💡 가장 약한 단원: <strong>{weakNodes[0].label}</strong> — 해당 단원
          체계도에서 복습을 시작해보세요.
        </p>
      ) : null}
    </div>
  );
}

interface AccuracyRow {
  key: string;
  label: string;
  user?: { correct: number; total: number };
  agg?: { correct: number; total: number };
}

function AccuracyTable({
  title,
  caption,
  headLabel,
  rows,
}: {
  title: string;
  caption: string;
  headLabel: string;
  rows: AccuracyRow[];
}) {
  const visible = rows.filter((r) => r.user || r.agg);
  return (
    <div className="border-border bg-card overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border border-b px-4 py-3">
        <p className="text-sm font-bold tracking-tight">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{caption}</p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-border bg-muted/60 border-b">
            <th className="text-muted-foreground px-4 py-2.5 text-left font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              {headLabel}
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              본인
            </th>
            <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
              전체
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className="text-muted-foreground px-4 py-5 text-center text-xs"
              >
                집계된 데이터가 없습니다.
              </td>
            </tr>
          ) : (
            visible.map((r) => (
              <tr
                key={r.key}
                className="border-border/60 border-b last:border-0"
              >
                <td className="px-4 py-2.5 text-[13px]">{r.label}</td>
                <td className="px-4 py-2.5 text-right text-[13px] tabular-nums">
                  {r.user
                    ? `${pct(r.user.correct, r.user.total)} (${r.user.correct}/${r.user.total})`
                    : "—"}
                </td>
                <td className="text-muted-foreground px-4 py-2.5 text-right text-[13px] tabular-nums">
                  {r.agg ? `${pct(r.agg.correct, r.agg.total)} (${r.agg.total})` : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true)
    return (
      <CheckCircle2Icon className="inline size-4 shrink-0 text-emerald-600" />
    );
  if (isCorrect === false)
    return <CircleXIcon className="inline size-4 shrink-0 text-rose-600" />;
  return (
    <MinusCircleIcon className="text-muted-foreground inline size-4 shrink-0" />
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "primary";
  icon?: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <p className="text-muted-foreground inline-flex items-center gap-1 font-mono text-[11px] font-semibold tracking-[0.04em] uppercase">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums",
          tone === "primary" && "text-link",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
    </div>
  );
}
