// 주관식(2차) 탭 — 2차 과목(특·상·디·민소)만 레일에 노출. 기존 문제(객관식) 탭 안의
// "2차 주관식" 섹션을 독립 탭으로 승격한 것. 고도화 전까지 staff 전용(학생 비활성).
//
// 레이아웃은 객관식 탭과 같은 2-패널: 좌측=체계도 트리 패널, 우측=연도별 그룹 목록.
// 주관식은 아직 체계도 노드 매핑이 없어(전부 미배정) 트리 카운트는 비어 있다 —
// 고도화(노드 매핑) 시 객관식 탭과 같은 노드 필터 흐름이 그대로 붙는다.
import type { ProblemFiltersApplied } from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import {
  ArrowRightIcon,
  ListTreeIcon,
  PencilIcon,
  StarIcon,
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

import { MobileNavDrawer } from "../mobile-nav-drawer";
import { ProblemSystematicTree } from "../problem-systematic-tree";
import { SortAxisProvider, SortAxisToggle } from "../sort-axis";

/** 문항별 답안 작성/제출(자기채점)/첨삭 완료 상태 — user_subjective_attempts 파생. */
export type SubjectiveAttemptStatus = Record<
  string,
  { submitted: boolean; reviewed: boolean }
>;

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
  isStaff = false,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  appliedFilters: ProblemFiltersApplied;
  attemptStatus: SubjectiveAttemptStatus;
  systematicNodes: SystematicNode[];
  // AI 생성 배지(비교분석용)는 운영자에게만 노출.
  isStaff?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const { width: leftWidth, setWidth: setLeftWidth } = useLeftPanelWidth();
  const filterActive =
    appliedFilters.origin != null ||
    appliedFilters.year != null ||
    (appliedFilters.search != null && appliedFilters.search.length > 0);

  // 문제 클릭 시 색인 컨텍스트를 실어 보낸다(객관식 탭과 동일 규약 — list=1).
  const problemLinkQuery = (() => {
    const sp = new URLSearchParams(searchParams);
    sp.delete("tab");
    sp.set("list", "1");
    const s = sp.toString();
    return s ? `?${s}` : "";
  })();

  const groups = groupByYear(problems);

  // 주관식 학습 현황 — 객관식 정답률 대신 답안 작성/제출/첨삭 진행으로 측정.
  const total = problems.length;
  const attempted = problems.filter((p) => attemptStatus[p.problemId]).length;
  const submitted = problems.filter(
    (p) => attemptStatus[p.problemId]?.submitted,
  ).length;
  const reviewed = problems.filter(
    (p) => attemptStatus[p.problemId]?.reviewed,
  ).length;
  const progressPct = total > 0 ? Math.round((attempted / total) * 100) : 0;

  // 좌측 체계도 트리 패널 — 객관식 탭과 동일 마크업(데스크톱 사이드바/모바일 드로어 공용).
  // 주관식은 아직 노드 매핑이 없어 카운트는 비어 있다(고도화 시 nodeStats 배선).
  const treePanel = (
    <SortAxisProvider forced="systematic">
      <div className="border-border bg-muted/30 overflow-hidden rounded-xl border lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
        <div className="border-border bg-card sticky top-0 z-10 flex items-center justify-end rounded-t-xl border-b px-3 py-2">
          <SortAxisToggle size="sm" disabledAxes={["statutory"]} />
        </div>
        <div className="p-2">
          <ProblemSystematicTree nodes={systematicNodes} nodeStats={{}} />
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

        {/* 주관식 학습 현황 — 답안 작성(진행률)·자기채점 제출·첨삭 완료 */}
        <div className="grid gap-3 sm:grid-cols-4">
          <SubjectiveKpiCard
            label="주관식 문항"
            value={total.toLocaleString("ko-KR")}
            sub="현재 등록된 전체"
          />
          <SubjectiveKpiCard
            label="답안 작성"
            value={`${attempted.toLocaleString("ko-KR")}문항`}
            sub={`진행률 ${progressPct}%`}
            accent={attempted > 0}
          />
          <SubjectiveKpiCard
            label="자기채점 제출"
            value={`${submitted.toLocaleString("ko-KR")}문항`}
            sub="작성 후 제출한 답안"
          />
          <SubjectiveKpiCard
            label="첨삭 완료"
            value={`${reviewed.toLocaleString("ko-KR")}문항`}
            sub="강사 검토를 받은 답안"
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
  status: { submitted: boolean; reviewed: boolean } | null;
}) {
  if (!status) return null;
  if (status.reviewed) {
    return (
      <Badge className="bg-violet-500 text-xs text-white hover:bg-violet-500">
        첨삭 완료
      </Badge>
    );
  }
  if (status.submitted) {
    return (
      <Badge className="bg-emerald-600 text-xs text-white hover:bg-emerald-600">
        제출함
      </Badge>
    );
  }
  return (
    <Badge className="bg-sky-500 text-xs text-white hover:bg-sky-500">
      작성 중
    </Badge>
  );
}

function SubjectiveCard({
  subjectSlug,
  item,
  linkQuery,
  status,
  isStaff = false,
}: {
  subjectSlug: LawSubjectMeta["slug"];
  item: ProblemListItem;
  linkQuery: string;
  status: { submitted: boolean; reviewed: boolean } | null;
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
