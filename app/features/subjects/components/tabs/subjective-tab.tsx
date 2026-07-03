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
import { Button } from "~/core/components/ui/button";
import { SheetHeader, SheetTitle } from "~/core/components/ui/sheet";
import type { SystematicNode } from "~/features/laws/queries.server";
import {
  ORIGIN_LABEL,
  type ProblemListItem,
  type ProblemOrigin,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";

import { MobileNavDrawer } from "../mobile-nav-drawer";
import { ProblemSystematicTree } from "../problem-systematic-tree";
import { SortAxisProvider, SortAxisToggle } from "../sort-axis";
import {
  SubjectStudyStatus,
  type SubjectStudyStatusProps,
} from "../subject-study-status";

// 출처 표시 — 기출변형도 "기출"로 묶어 노출(객관식 탭과 동일 정책).
function mergedOriginLabel(origin: ProblemOrigin): string {
  return origin === "past_exam_variant"
    ? ORIGIN_LABEL.past_exam
    : ORIGIN_LABEL[origin];
}

interface YearGroup {
  /** null = 연도 미상(예상문제 등) — 목록 맨 뒤. */
  year: number | null;
  items: ProblemListItem[];
}

function groupByYear(problems: ProblemListItem[]): YearGroup[] {
  // 시험 최신순(연도 desc, 회차 desc) + 문제번호 asc — 2차 기출 목록과 동일 규칙.
  const sorted = [...problems].sort(
    (a, b) =>
      (b.year ?? -1) - (a.year ?? -1) ||
      (b.examRoundNo ?? -1) - (a.examRoundNo ?? -1) ||
      (a.problemNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.problemNumber ?? Number.MAX_SAFE_INTEGER),
  );
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
  studyStatus,
  systematicNodes,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  appliedFilters: ProblemFiltersApplied;
  studyStatus: SubjectStudyStatusProps;
  systematicNodes: SystematicNode[];
}) {
  const [searchParams] = useSearchParams();
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

  // 좌측 체계도 트리 패널 — 객관식 탭과 동일 마크업(데스크톱 사이드바/모바일 드로어 공용).
  // 주관식은 아직 노드 매핑이 없어 카운트는 비어 있다(고도화 시 nodeStats 배선).
  const treePanel = (
    <SortAxisProvider forced="systematic">
      <div className="border-border bg-muted/30 overflow-hidden rounded-xl border">
        <div className="border-border flex items-center justify-end border-b px-3 py-2">
          <SortAxisToggle size="sm" disabledAxes={["statutory"]} />
        </div>
        <div className="p-2">
          <ProblemSystematicTree nodes={systematicNodes} nodeStats={{}} />
        </div>
      </div>
    </SortAxisProvider>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Left: 체계도 패널 — 데스크톱만 sticky 사이드바. 모바일은 드로어. */}
      <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-auto">
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
                <ListTreeIcon className="size-3.5" /> 체계별로 찾기
              </Button>
            }
          >
            <SheetHeader className="border-border border-b px-4 py-3">
              <SheetTitle className="text-sm font-semibold">체계도</SheetTitle>
            </SheetHeader>
            <div className="px-3 py-3">{treePanel}</div>
          </MobileNavDrawer>
        </div>

        <SubjectStudyStatus {...studyStatus} />

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

function SubjectiveCard({
  subjectSlug,
  item,
  linkQuery,
}: {
  subjectSlug: LawSubjectMeta["slug"];
  item: ProblemListItem;
  linkQuery: string;
}) {
  const snippet =
    item.bodyMd.length > 160 ? `${item.bodyMd.slice(0, 160)}…` : item.bodyMd;
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
            {mergedOriginLabel(item.origin)}
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
          {item.primaryArticleLabel ? (
            <Badge variant="outline" className="text-xs">
              {item.primaryArticleLabel}
            </Badge>
          ) : null}
        </div>
        {item.subjectiveTopic ? (
          <p className="text-muted-foreground mb-1 text-xs">
            논점 — {item.subjectiveTopic}
          </p>
        ) : null}
        <p className="line-clamp-2 text-sm leading-snug">{snippet}</p>
        <p className="text-link mt-2 inline-flex items-center gap-1 text-xs">
          지금 풀어보기 <ArrowRightIcon className="size-3" />
        </p>
      </div>
    </Link>
  );
}
