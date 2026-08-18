// 주관식(2차) 탭 — 2차 과목(특·상·디·민소)만 레일에 노출. 기존 문제(객관식) 탭 안의
// "2차 주관식" 섹션을 독립 탭으로 승격한 것. 고도화 전까지 staff 전용(학생 비활성).
//
// 레이아웃은 객관식 탭과 같은 2-패널: 좌측=체계도 트리 패널, 우측=연도별 그룹 목록.
// 체계도 배치는 problem_systematic_links(설문별 논점 → 노드, 복수 배치) 기반 —
// 트리 카운트·?node= 필터·카드 배지가 이 링크를 공유한다.
import type {
  ProblemFiltersApplied,
  ProblemNodeFilter,
} from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import {
  ArrowRightIcon,
  ListTreeIcon,
  MapPinIcon,
  PencilIcon,
  StarIcon,
  XIcon,
} from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import {
  LeftPanelResizer,
  useLeftPanelWidth,
} from "~/features/subjects/components/left-panel-collapse";
import { Button } from "~/core/components/ui/button";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import type { SystematicNode } from "~/features/laws/queries.server";
import {
  compareSubjectiveDisplay,
  ORIGIN_LABEL,
  type ProblemListItem,
  type ProblemOrigin,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";
import type {
  ProblemPlacement,
  SubjectiveNodeLeaf,
  SystematicNodeProblemStat,
} from "~/features/problems/queries.server";

import { MobileNavDrawer } from "../mobile-nav-drawer";
import { ProblemSystematicTree } from "../problem-systematic-tree";
import { SortAxisProvider, SortAxisToggle } from "../sort-axis";
import { stripSystematicNumber } from "../systematic-node-label";

/** 문항별 3단계 훈련 진행(작성한 단계 수)·AI 채점 여부 — user_subjective_attempts 파생. */
export type SubjectiveAttemptStatus = Record<
  string,
  { stagesDone: number; aiGraded: boolean }
>;

/** 훈련 단계 수 — ① 논점 ② 목차 ③ 포섭·결론 (subjective-panel 의 STAGES 와 동수). */
const STAGE_TOTAL = 3;

interface YearGroup {
  /** null = 연도 미상(예상문제 등) — 목록 맨 뒤. */
  year: number | null;
  items: ProblemListItem[];
}

function groupByYear(problems: ProblemListItem[]): YearGroup[] {
  // 시험 최신순(연도 desc, 회차 desc) + 문제번호 asc — 뷰어 prev/next 와 공유(labels).
  const sorted = [...problems].sort(compareSubjectiveDisplay);
  const groups: YearGroup[] = [];
  for (const p of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.year === (p.year ?? null)) last.items.push(p);
    else groups.push({ year: p.year ?? null, items: [p] });
  }
  return groups;
}

const yearAnchorId = (year: number | null) =>
  `subjective-${year ?? "unknown"}`;

export function SubjectiveTab({
  subject,
  problems,
  appliedFilters,
  attemptStatus,
  systematicNodes,
  nodeStats = {},
  nodeLeaves = {},
  nodeFilter = null,
  placements = {},
  isStaff = false,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  appliedFilters: ProblemFiltersApplied;
  attemptStatus: SubjectiveAttemptStatus;
  systematicNodes: SystematicNode[];
  // 체계도 노드별 {문제 수, 첫 문제} — problem_systematic_links subtree 합산.
  nodeStats?: Record<string, SystematicNodeProblemStat>;
  // 노드 직접 배치 기출 leaf — "2015년 제52회 문제2" 표기.
  nodeLeaves?: Record<string, SubjectiveNodeLeaf[]>;
  // ?tab=subjective&node= 필터 (무효 노드면 null).
  nodeFilter?: ProblemNodeFilter | null;
  // 문항별 배치 노드 목록 (카드 배지).
  placements?: Record<string, ProblemPlacement[]>;
  // AI 생성 배지(비교분석용)는 운영자에게만 노출.
  isStaff?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const { width: leftWidth, setWidth: setLeftWidth } = useLeftPanelWidth();
  const filterActive =
    appliedFilters.origin != null ||
    appliedFilters.year != null ||
    nodeFilter != null ||
    (appliedFilters.search != null && appliedFilters.search.length > 0);
  // "전체 보기" — node 만 제거하고 나머지 파라미터 보존.
  const clearNodeHref = (() => {
    const next = new URLSearchParams(searchParams);
    next.delete("node");
    next.set("tab", "subjective");
    return `?${next.toString()}`;
  })();

  // 문제 클릭 시 색인 컨텍스트를 실어 보낸다(객관식 탭과 동일 규약 — list=1).
  // ★node 는 제거 — 뷰어 list 모드의 노드 해석(listDisplayedProblems)은 객관식
  //   조문 파생 시맨틱이라 링크 기반 주관식 필터와 어긋난다. prev/next 는 주관식
  //   전체 목록 순서로 폴백(뷰어 배치 배지가 허브 노드 필터로 복귀 경로 제공).
  const problemLinkQuery = (() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("tab");
    sp.delete("node");
    sp.set("list", "1");
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();

  const groups = groupByYear(problems);

  // 주관식 학습 현황 — 객관식 정답률 대신 3단계 훈련 진행으로 측정.
  const total = problems.length;
  const attempted = problems.filter(
    (p) => (attemptStatus[p.problemId]?.stagesDone ?? 0) > 0,
  ).length;
  // 3단계를 모두 채운 문항 / AI 채점까지 받은 문항.
  const submitted = problems.filter(
    (p) => (attemptStatus[p.problemId]?.stagesDone ?? 0) >= STAGE_TOTAL,
  ).length;
  const reviewed = problems.filter(
    (p) => attemptStatus[p.problemId]?.aiGraded,
  ).length;
  const progressPct = total > 0 ? Math.round((attempted / total) * 100) : 0;

  // 트리 기출 leaf — 노드 아래 "2015년 제52회 문제2" 표기 + 뷰어 링크.
  const treeLeaves = (() => {
    const out: Record<string, { key: string; label: string; to: string }[]> =
      {};
    for (const [nodeId, items] of Object.entries(nodeLeaves)) {
      out[nodeId] = items.map((l) => ({
        key: l.problemId,
        label:
          l.year != null
            ? `${l.year}년${l.examRoundNo != null ? ` 제${l.examRoundNo}회` : ""}${l.problemNumber != null ? ` 문제${l.problemNumber}` : ""}`
            : "연도 미상",
        to: `/subjects/${subject.slug}/problems/${l.problemId}${problemLinkQuery}`,
      }));
    }
    return out;
  })();

  // 좌측 체계도 트리 패널 — 객관식 탭과 동일 마크업(데스크톱 사이드바/모바일 드로어 공용).
  // 카운트=링크 배치 subtree 합산, 노드 클릭 → ?tab=subjective&node= 필터.
  const treePanel = (
    <SortAxisProvider forced="systematic">
      <div className="border-border bg-muted/30 overflow-hidden rounded-xl border lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <div className="border-border bg-card sticky top-0 z-10 flex items-center justify-end rounded-t-xl border-b px-3 py-2">
          <SortAxisToggle size="sm" disabledAxes={["statutory"]} />
        </div>
        <div className="p-2">
          <ProblemSystematicTree
            nodes={systematicNodes}
            nodeStats={nodeStats}
            nodeLeaves={treeLeaves}
            activeNodeId={nodeFilter?.nodeId}
            tab="subjective"
          />
        </div>
      </div>
    </SortAxisProvider>
  );

  return (
    <div
      className="grid gap-6 lg:grid-cols-[var(--left-w,260px)_minmax(0,1fr)]"
      style={{ ["--left-w" as string]: `${leftWidth}px` }}
    >
      {/* Left: 체계도 패널 — 데스크톱만 sticky 사이드바. 모바일은 드로어. 경계 드래그로 폭 조절. */}
      <aside className="relative hidden lg:sticky lg:top-20 lg:block">
        <LeftPanelResizer width={leftWidth} onWidth={setLeftWidth} />
        {treePanel}
      </aside>

      <section className="space-y-4">
        {/* 모바일 체계도 드로어 — 목록이 위로 오고, 트리는 버튼으로 연다 */}
        <div className="lg:hidden">
          <MobileNavDrawer
            side="left"
            contentClassName="w-[320px] overflow-y-auto p-0 sm:max-w-[360px]"
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-full text-xs"
              >
                <ListTreeIcon className="size-3.5" /> 목차로 찾기
              </Button>
            }
          >
            <SheetHeader className="border-border border-b px-4 py-3">
              <SheetTitle className="text-sm font-semibold">목차</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-3">{treePanel}</div>
          </MobileNavDrawer>
        </div>

        {/* 체계도 노드 필터 배너 — 객관식 탭과 동일 규약 */}
        {nodeFilter ? (
          <div className="border-border bg-primary/[0.04] flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-xs">
            <MapPinIcon className="text-link size-3.5 shrink-0" />
            <span className="text-muted-foreground">체계도 필터</span>
            <Badge variant="secondary" className="max-w-[260px] truncate">
              {stripSystematicNumber(nodeFilter.label)}
            </Badge>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2"
            >
              <Link to={clearNodeHref} preventScrollReset>
                <XIcon className="size-3" /> 전체 보기
              </Link>
            </Button>
          </div>
        ) : null}

        {/* 주관식 학습 현황 — 답안 작성(진행률)·자기채점 제출·첨삭 완료 */}
        <div className="grid gap-3 sm:grid-cols-4">
          <SubjectiveKpiCard
            label="주관식 문항"
            value={total.toLocaleString("ko-KR")}
            sub="현재 등록된 전체"
          />
          <SubjectiveKpiCard
            label="훈련 착수"
            value={`${attempted.toLocaleString("ko-KR")}문항`}
            sub={`진행률 ${progressPct}%`}
            accent={attempted > 0}
          />
          <SubjectiveKpiCard
            label="3단계 완주"
            value={`${submitted.toLocaleString("ko-KR")}문항`}
            sub="논점·목차·포섭까지"
          />
          <SubjectiveKpiCard
            label="AI 채점"
            value={`${reviewed.toLocaleString("ko-KR")}문항`}
            sub="3축 초안 채점을 받은 문항"
          />
        </div>
        {total > 0 ? (
          <div
            className="bg-muted h-2 w-full overflow-hidden rounded-full"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="주관식 답안 작성 진행률"
          >
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        ) : null}

        {groups.length === 0 ? (
          <div className="border-border rounded-xl border border-dashed p-10 text-center">
            <p className="text-muted-foreground text-sm">
              {filterActive
                ? "조건에 맞는 주관식 문제가 없습니다."
                : "등록된 주관식 문제가 아직 없습니다."}
            </p>
          </div>
        ) : (
          groups.map((g) => (
            <div
              key={yearAnchorId(g.year)}
              id={yearAnchorId(g.year)}
              className="border-border scroll-mt-24 overflow-hidden rounded-xl border shadow-sm"
            >
              <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <PencilIcon className="text-link size-4" />
                  <h3 className="text-sm font-semibold">
                    {g.year != null
                      ? `${g.year}년${g.items[0]?.examRoundNo != null ? ` 제${g.items[0].examRoundNo}회` : ""} 2차`
                      : "연도 미상"}
                  </h3>
                </div>
                <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums">
                  {g.items.length}건
                </span>
              </div>
              <div className="space-y-2 p-4">
                {g.items.map((p) => (
                  <SubjectiveCard
                    key={p.problemId}
                    subjectSlug={subject.slug}
                    item={p}
                    linkQuery={problemLinkQuery}
                    status={attemptStatus[p.problemId] ?? null}
                    placements={placements[p.problemId] ?? []}
                    isStaff={isStaff}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function SubjectiveKpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground text-[11px] font-semibold tracking-wide">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-extrabold tabular-nums ${accent ? "text-link" : "text-foreground"}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-muted-foreground mt-0.5 text-[11px]">{sub}</p>
      ) : null}
    </div>
  );
}

// 문항 학습 상태 배지 — 첨삭 완료 > 제출 > 작성 중 우선.
function AttemptStatusBadge({
  status,
}: {
  status: { stagesDone: number; aiGraded: boolean } | null;
}) {
  if (!status || status.stagesDone === 0) return null;
  if (status.aiGraded) {
    return (
      <Badge className="bg-violet-500 text-xs text-white hover:bg-violet-500">
        AI 채점 완료
      </Badge>
    );
  }
  if (status.stagesDone >= STAGE_TOTAL) {
    return (
      <Badge className="bg-emerald-600 text-xs text-white hover:bg-emerald-600">
        3단계 완주
      </Badge>
    );
  }
  return (
    <Badge className="bg-sky-500 text-xs text-white hover:bg-sky-500">
      {status.stagesDone}/{STAGE_TOTAL}단계
    </Badge>
  );
}

function SubjectiveCard({
  subjectSlug,
  item,
  linkQuery,
  status,
  placements = [],
  isStaff = false,
}: {
  subjectSlug: LawSubjectMeta["slug"];
  item: ProblemListItem;
  linkQuery: string;
  status: { stagesDone: number; aiGraded: boolean } | null;
  placements?: ProblemPlacement[];
  isStaff?: boolean;
}) {
  // 카드 미리보기 — 본문의 HTML(case-box)·표·이미지·강조 마크업을 걷어낸 평문.
  const plain = item.bodyMd
    .replace(/<[^>]+>/g, " ")
    .replace(/^\|.*\|\s*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const snippet = plain.length > 160 ? `${plain.slice(0, 160)}…` : plain;
  return (
    <Link
      to={`/subjects/${subjectSlug}/problems/${item.problemId}${linkQuery}`}
      viewTransition
      prefetch="intent"
      className="group block"
    >
      <div className="border-border bg-card hover:border-primary rounded-xl border p-4 transition-colors">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="default" className="text-xs">
            <PencilIcon className="size-3" /> 주관식
          </Badge>
          {item.importance >= 1 ? (
            <Badge
              variant="outline"
              className="border-amber-300 text-xs text-amber-600 dark:border-amber-700 dark:text-amber-400"
            >
              <StarIcon className="size-3 fill-current" /> {item.importance}
            </Badge>
          ) : null}
          <Badge variant="secondary" className="text-xs">
            {ORIGIN_LABEL[item.origin]}
          </Badge>
          {item.problemNumber ? (
            <Badge variant="outline" className="text-xs tabular-nums">
              문제 {item.problemNumber}
            </Badge>
          ) : null}
          {item.subjectiveKind ? (
            <Badge variant="default" className="text-xs">
              {SUBJECTIVE_KIND_LABEL[item.subjectiveKind]}
            </Badge>
          ) : null}
          {(item.modelAnswerMd ?? "").trim() ? (
            <Badge
              variant="outline"
              className="border-emerald-400/40 bg-emerald-50/60 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
              title="채점기준·모범답안이 등록된 문제입니다"
            >
              모범답안
            </Badge>
          ) : null}
          {isStaff && item.rubricAiGeneratedAt ? (
            <Badge
              variant="outline"
              className="border-violet-300 bg-violet-50 text-xs text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
              title="채점기준·모범답안이 AI 생성된 문항입니다(운영자 전용 표시, 비교분석용)"
            >
              AI 생성
            </Badge>
          ) : null}
          {isStaff && item.rubricReviewedAt ? (
            <Badge
              variant="outline"
              className="border-emerald-400/60 bg-emerald-50 text-xs text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
              title={`운영자 검수완료 (${new Date(item.rubricReviewedAt).toLocaleDateString("ko-KR")})`}
            >
              ✓ 검수완료
            </Badge>
          ) : null}
          {item.primaryArticleLabel ? (
            <Badge variant="outline" className="text-xs">
              {item.primaryArticleLabel}
            </Badge>
          ) : null}
          <span className="ml-auto">
            <AttemptStatusBadge status={status} />
          </span>
        </div>
        {item.subjectiveTopic ? (
          <p className="text-muted-foreground mb-1 text-xs">
            논점 — {item.subjectiveTopic}
          </p>
        ) : null}
        {placements.length > 0 ? (
          <p className="mb-1.5 flex flex-wrap items-center gap-1">
            {placements.map((pl) => (
              <span
                key={pl.linkId}
                title={pl.note ?? undefined}
                className="border-border bg-muted/60 text-muted-foreground inline-flex max-w-[240px] items-center gap-1 truncate rounded-full border px-2 py-0.5 text-[11px]"
              >
                <MapPinIcon className="text-link size-3 shrink-0" />
                <span className="truncate">
                  {stripSystematicNumber(pl.label)}
                </span>
              </span>
            ))}
          </p>
        ) : null}
        <p className="line-clamp-2 text-sm leading-snug">{snippet}</p>
        {(item.subjectiveKeywords ?? []).length > 0 ? (
          <p className="text-link mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold">
            {(item.subjectiveKeywords ?? []).map((k) => (
              <span key={k}>#{k}</span>
            ))}
          </p>
        ) : null}
        <p className="text-link mt-2 inline-flex items-center gap-1 text-xs">
          지금 풀어보기 <ArrowRightIcon className="size-3" />
        </p>
      </div>
    </Link>
  );
}
