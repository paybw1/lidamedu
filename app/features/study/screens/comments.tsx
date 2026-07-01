// 코멘트 — 조문·판례·문제 뷰어에서 작성한 코멘트(content_comments) 모아보기. 최근 수정 순.
// 포스트잇(/study/notes)과 형제 화면 — StudyAidsShell 공유.
import type { Route } from "./+types/comments";

import { MessageSquareTextIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllComments } from "~/features/comments/queries.server";
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
  { title: "코멘트 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, aidCounts] = await Promise.all([
    listAllComments(client, user.id),
    getStudyAidCounts(client, user.id),
  ]);
  const counts = { total: items.length, article: 0, case: 0, problem: 0, ox: 0 };
  for (const c of items) {
    if (c.targetType === "article") counts.article += 1;
    else if (c.targetType === "case") counts.case += 1;
    else if (c.targetType === "problem") counts.problem += 1;
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

export default function Comments({ loaderData }: Route.ComponentProps) {
  const { items: all, counts, aidCounts } = loaderData;
  const [subject, setSubject] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter | null>(null);
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  const [q, setQ] = useState("");
  const hasActive =
    subject !== null ||
    type !== null ||
    !isRangeSelectionAll(rangeSel) ||
    q.trim() !== "";
  const reset = () => {
    setSubject(null);
    setType(null);
    setRangeSel(ALL_RANGE_SELECTION);
    setQ("");
  };

  const needle = q.trim().toLowerCase();
  const items = all.filter((c) => {
    if (subject && c.lawCode !== subject) return false;
    if (type === "ox") {
      if (
        c.targetType !== "problem_choice" &&
        c.targetType !== "problem_box_item"
      )
        return false;
    } else if (type && c.targetType !== type) return false;
    if (!inRangeSelection(c.updatedAt, rangeSel)) return false;
    if (needle) {
      const hay = [c.bodyMd, c.primaryLabel, c.secondaryLabel, c.bodySnippet]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <StudyAidsShell
      active="comments"
      tabCounts={toTabCounts(aidCounts)}
      title="코멘트"
      desc="조문 · 판례 · 문제 · 정오문제 뷰어에서 작성한 코멘트. 최근 수정 순으로 정렬됩니다."
      summaryStats={[
        { label: "전체", value: counts.total, dotClass: "bg-primary" },
        { label: "조문", value: counts.article, dotClass: "bg-primary" },
        { label: "판례", value: counts.case, dotClass: "bg-violet-500" },
        { label: "문제", value: counts.problem, dotClass: "bg-amber-500" },
        { label: "정오문제", value: counts.ox, dotClass: "bg-rose-500" },
      ]}
    >
      <FilterBar
        hasActive={hasActive}
        onReset={reset}
        search={{
          value: q,
          onChange: setQ,
          placeholder: "코멘트 본문 검색",
        }}
      >
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
        <RangeSelectionGroup value={rangeSel} onChange={setRangeSel} />
      </FilterBar>

      {items.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            icon={MessageSquareTextIcon}
            tone="neutral"
            title="아직 코멘트가 없습니다"
            body="조문·판례·문제 뷰어에서 코멘트를 남겨 보세요. 모은 코멘트는 이 화면에서 한 번에 검색할 수 있습니다."
            cta={{ label: "학습 시작", to: "/dashboard" }}
          />
        ) : (
          <EmptyState
            icon={SearchIcon}
            tone="subdued"
            title="검색·필터에 해당하는 코멘트가 없습니다"
            body="검색어를 줄이거나 필터를 풀어 보세요."
          />
        )
      ) : (
        <ListStack testid="comments-list">
          {items.map((c) => (
            <ResultCard key={c.commentId} to={c.href}>
              <CardHeaderRow
                type={c.targetType}
                lawName={subjectName(c.lawCode)}
                secondary={c.secondaryLabel}
                right={
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {formatRelative(c.updatedAt)}
                  </span>
                }
              />
              <div className="mt-1.5 mb-2 text-[15px] font-bold tracking-tight">
                {c.primaryLabel}
              </div>
              {c.bodySnippet ? (
                <div className="border-border bg-muted/50 text-muted-foreground mb-2 rounded-md border-l-[3px] px-3 py-2 text-[13px] leading-relaxed">
                  {c.bodySnippet}
                </div>
              ) : null}
              <div className="border-primary bg-primary/[0.06] flex gap-2 rounded-lg border-l-[3px] px-3 py-2.5">
                <MessageSquareTextIcon className="text-link mt-0.5 size-3.5 shrink-0" />
                <span className="text-foreground/90 text-[13.5px] leading-relaxed whitespace-pre-line">
                  {c.bodyMd}
                </span>
              </div>
              <CardCta label="원문에서 보기" />
            </ResultCard>
          ))}
        </ListStack>
      )}
    </StudyAidsShell>
  );
}
