// 즐겨찾기 — ♡ 별점을 매긴 조문·판례·문제·OX 모음. 별점 높은 순.
// 키트 lidam-study-aids/BookmarksScreen 디자인.
import type { Route } from "./+types/bookmarks";

import { BookmarkIcon, SearchIcon, StickyNoteIcon } from "lucide-react";
import { useState } from "react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllBookmarks } from "~/features/annotations/queries.server";
import {
  ALL_RANGE_SELECTION,
  CardCta,
  CardHeaderRow,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterDivider,
  FilterGroup,
  ListStack,
  type RangeSelection,
  RangeSelectionGroup,
  ResultCard,
  SessionBanner,
  StarBar,
  formatRelative,
  inRangeSelection,
  isRangeSelectionAll,
  subjectName,
} from "~/features/study/components/study-aids-list";
import {
  StudyAidsShell,
  toTabCounts,
} from "~/features/study/components/study-aids-shell";
import { getStudyAidCounts } from "~/features/study/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "즐겨찾기 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, aidCounts] = await Promise.all([
    listAllBookmarks(client, user.id),
    getStudyAidCounts(client, user.id),
  ]);
  const counts = {
    total: items.length,
    article: 0,
    case: 0,
    problem: 0,
    ox: 0,
  };
  for (const b of items) {
    if (b.targetType === "article") counts.article += 1;
    else if (b.targetType === "case") counts.case += 1;
    else if (b.targetType === "problem") counts.problem += 1;
    else counts.ox += 1;
  }
  return { items, counts, aidCounts };
}

type TypeFilter = "article" | "case" | "problem" | "ox";

const TYPE_OPTIONS = [
  ["article", "조문"],
  ["case", "판례"],
  ["problem", "문제"],
  ["ox", "정오문제"],
] as const;

export default function Bookmarks({ loaderData }: Route.ComponentProps) {
  const { items: all, counts, aidCounts } = loaderData;
  const [subject, setSubject] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter | null>(null);
  const [minStar, setMinStar] = useState(1);
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  // 텍스트 검색 — 연도·번호(primaryLabel)·과목명(secondaryLabel, 예 "물리")·본문·메모 매칭.
  // 자연과학 문제는 lawCode=null 이라 과목 칩엔 안 걸리지만 이 검색으로 찾을 수 있다.
  const [query, setQuery] = useState("");
  const hasActive =
    subject !== null ||
    type !== null ||
    minStar > 1 ||
    query.trim() !== "" ||
    !isRangeSelectionAll(rangeSel);
  const reset = () => {
    setSubject(null);
    setType(null);
    setMinStar(1);
    setQuery("");
    setRangeSel(ALL_RANGE_SELECTION);
  };

  const q = query.trim().toLowerCase();
  const items = all.filter((b) => {
    if (subject && b.lawCode !== subject) return false;
    if (type === "ox") {
      if (
        b.targetType !== "problem_choice" &&
        b.targetType !== "problem_box_item"
      )
        return false;
    } else if (type && b.targetType !== type) return false;
    if (b.starLevel < minStar) return false;
    if (!inRangeSelection(b.updatedAt, rangeSel)) return false;
    if (
      q &&
      ![b.primaryLabel, b.secondaryLabel, b.bodySnippet, b.notePreview].some(
        (t) => t?.toLowerCase().includes(q),
      )
    )
      return false;
    return true;
  });
  const problemCount = items.filter((b) => b.targetType === "problem").length;

  return (
    <StudyAidsShell
      active="bookmarks"
      tabCounts={toTabCounts(aidCounts)}
      title="즐겨찾기"
      desc="별점을 매겨 둔 조문 · 판례 · 문제 · 정오문제 모음. 별점 높은 순으로 정렬됩니다."
      printHref="/study/bookmarks/print"
      summaryStats={[
        { label: "전체", value: counts.total, dotClass: "bg-primary" },
        { label: "조문", value: counts.article, dotClass: "bg-primary" },
        { label: "판례", value: counts.case, dotClass: "bg-violet-500" },
        { label: "문제", value: counts.problem, dotClass: "bg-amber-500" },
        { label: "정오문제", value: counts.ox, dotClass: "bg-rose-500" },
      ]}
    >
      <FilterBar hasActive={hasActive} onReset={reset}>
        <FilterGroup label="검색">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="연도·번호·과목·본문·메모"
            className="border-border focus:border-primary h-7 w-44 rounded-md border bg-transparent px-2 text-xs outline-none"
          />
        </FilterGroup>
        <FilterDivider />
        <FilterGroup label="1차 과목">
          <FilterChip selected={!subject} onClick={() => setSubject(null)}>
            전체
          </FilterChip>
          {FIRST_EXAM_LAW_SLUGS.map((s) => (
            <FilterChip
              key={s}
              selected={subject === s}
              onClick={() => setSubject(s)}
            >
              {LAW_SUBJECTS[s].name}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterDivider />
        <FilterGroup label="2차 과목">
          {SECOND_EXAM_LAW_SLUGS.map((s) => (
            <FilterChip
              key={s}
              selected={subject === s}
              onClick={() => setSubject(s)}
            >
              {LAW_SUBJECTS[s].name}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterDivider />
        <FilterGroup label="유형">
          <FilterChip selected={!type} onClick={() => setType(null)}>
            전체
          </FilterChip>
          {TYPE_OPTIONS.map(([k, label]) => (
            <FilterChip
              key={k}
              selected={type === k}
              onClick={() => setType(k)}
            >
              {label}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterDivider />
        <FilterGroup label="최소 별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <FilterChip
              key={n}
              tone="amber"
              selected={minStar === n}
              onClick={() => setMinStar(n)}
            >
              ★ {n}↑
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterDivider />
        <RangeSelectionGroup value={rangeSel} onChange={setRangeSel} />
      </FilterBar>

      {problemCount > 0 ? (
        <SessionBanner
          action="/api/study/session-from-bookmarks"
          count={problemCount}
          hint="필터 결과 안의 객관식 문제만 한 회차로 묶어 풀기."
          testidPrefix="bookmark-start"
          hidden={
            <>
              {subject !== null ? (
                <input type="hidden" name="subject" value={subject} />
              ) : null}
              {minStar > 1 ? (
                <input type="hidden" name="minStar" value={String(minStar)} />
              ) : null}
            </>
          }
        />
      ) : null}

      {items.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            icon={BookmarkIcon}
            tone="neutral"
            title="아직 즐겨찾기가 없습니다"
            body="조문·판례·문제 뷰어 우측 패널의 ♡ 별점으로 추가해 보세요. 별점 높은 순으로 이곳에 모입니다."
            cta={{ label: "학습 시작", to: "/dashboard" }}
          />
        ) : (
          <EmptyState
            icon={SearchIcon}
            tone="subdued"
            title="필터에 해당하는 즐겨찾기가 없습니다"
            body="필터를 풀거나 별점 기준을 낮춰 보세요."
          />
        )
      ) : (
        <ListStack testid="bookmarks-list">
          {items.map((b) => (
            <ResultCard key={`${b.targetType}:${b.targetId}`} to={b.href}>
              <CardHeaderRow
                type={b.targetType}
                lawName={subjectName(b.lawCode)}
                secondary={b.secondaryLabel}
                right={
                  <>
                    {b.oxTruth ? (
                      <span className="border-border text-muted-foreground inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] font-semibold">
                        정답 {b.oxTruth}
                      </span>
                    ) : null}
                    <StarBar level={b.starLevel} />
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {formatRelative(b.updatedAt)}
                    </span>
                  </>
                }
              />
              <div className="mt-1.5 text-[15px] font-bold tracking-tight">
                {b.primaryLabel}
              </div>
              {b.bodySnippet ? (
                <p className="text-foreground/80 mt-1 text-[13px] leading-relaxed">
                  {b.bodySnippet}
                </p>
              ) : null}
              {b.notePreview ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-2 text-[12px] leading-relaxed">
                  <StickyNoteIcon className="mt-0.5 size-3 shrink-0 text-violet-600 dark:text-violet-300" />
                  <span>
                    <strong className="mr-1 font-bold text-violet-600 dark:text-violet-300">
                      메모
                    </strong>
                    {b.notePreview}
                  </span>
                </div>
              ) : null}
              <CardCta label="다시 학습" />
            </ResultCard>
          ))}
        </ListStack>
      )}
    </StudyAidsShell>
  );
}
