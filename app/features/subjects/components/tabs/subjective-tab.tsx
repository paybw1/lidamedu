// 주관식(2차) 탭 — 2차 과목(특·상·디·민소)만 레일에 노출. 기존 문제(객관식) 탭 안의
// "2차 주관식" 섹션을 독립 탭으로 승격한 것. 목록은 시험 최신순 + 문제번호 오름차순.
import type {
  ProblemFiltersApplied,
} from "../../lib/loader.server";
import type { LawSubjectMeta } from "../../lib/subjects";

import { ArrowRightIcon, PencilIcon, StarIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import {
  ORIGIN_LABEL,
  type ProblemListItem,
  type ProblemOrigin,
  SUBJECTIVE_KIND_LABEL,
} from "~/features/problems/labels";

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

export function SubjectiveTab({
  subject,
  problems,
  appliedFilters,
  studyStatus,
}: {
  subject: LawSubjectMeta;
  problems: ProblemListItem[];
  appliedFilters: ProblemFiltersApplied;
  studyStatus: SubjectStudyStatusProps;
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

  // 시험 최신순(연도 desc, 회차 desc) + 문제번호 asc — 2차 기출 목록과 동일 규칙.
  const sorted = [...problems].sort(
    (a, b) =>
      (b.year ?? -1) - (a.year ?? -1) ||
      (b.examRoundNo ?? -1) - (a.examRoundNo ?? -1) ||
      (a.problemNumber ?? Number.MAX_SAFE_INTEGER) -
        (b.problemNumber ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="mt-6 space-y-5">
      <SubjectStudyStatus {...studyStatus} />

      <section className="space-y-4">
        <div className="border-border overflow-hidden rounded-xl border shadow-sm">
          <div className="border-border bg-muted/30 flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <PencilIcon className="text-link size-4" />
              <h3 className="text-sm font-semibold">
                {subject.name} 2차 주관식
              </h3>
            </div>
            <span className="border-border bg-background text-muted-foreground inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums">
              {sorted.length}건
            </span>
          </div>
          <div className="p-4">
            {sorted.length === 0 ? (
              <div className="border-border rounded-lg border border-dashed p-8 text-center">
                <p className="text-muted-foreground text-sm">
                  {filterActive
                    ? "조건에 맞는 주관식 문제가 없습니다."
                    : "등록된 주관식 문제가 아직 없습니다."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {sorted.map((p) => (
                  <SubjectiveCard
                    key={p.problemId}
                    subjectSlug={subject.slug}
                    item={p}
                    linkQuery={problemLinkQuery}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
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
          {item.year ? (
            <Badge variant="outline" className="text-xs tabular-nums">
              {item.year}
              {item.problemNumber ? ` · ${item.problemNumber}번` : ""}
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
