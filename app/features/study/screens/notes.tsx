// 포스트잇 — 조문·판례·문제 뷰어에서 작성한 포스트잇 모아보기. 최근 수정 순.
// 키트 lidam-study-aids/NotesScreen 디자인.
import type { Route } from "./+types/notes";

import { PencilLineIcon, SearchIcon, StickyNoteIcon } from "lucide-react";
import { useState } from "react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listAllMemos } from "~/features/annotations/queries.server";
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
  { title: "포스트잇 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, aidCounts] = await Promise.all([
    listAllMemos(client, user.id),
    getStudyAidCounts(client, user.id),
  ]);
  const counts = {
    total: items.length,
    article: 0,
    case: 0,
    problem: 0,
  };
  for (const m of items) {
    if (m.targetType === "article") counts.article += 1;
    else if (m.targetType === "case") counts.case += 1;
    else counts.problem += 1;
  }
  return { items, counts, aidCounts };
}

// 정오문제(OX)는 "지문 전체 대상"이라 포스트잇이 아니라 코멘트로 관리(/study/comments).
// 포스트잇 = 문구 앵커 → 조문·판례·문제 본문만.
type TypeFilter = "article" | "case" | "problem";

const TYPE_OPTIONS = [
  ["article", "조문"],
  ["case", "판례"],
  ["problem", "문제"],
] as const;

export default function Notes({ loaderData }: Route.ComponentProps) {
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
  const items = all.filter((m) => {
    if (subject && m.lawCode !== subject) return false;
    if (type && m.targetType !== type) return false;
    if (!inRangeSelection(m.updatedAt, rangeSel)) return false;
    if (needle) {
      const hay = [
        m.bodyMd,
        m.snippet,
        m.primaryLabel,
        m.secondaryLabel,
        m.bodySnippet,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <StudyAidsShell
      active="notes"
      tabCounts={toTabCounts(aidCounts)}
      title="포스트잇"
      helpKey="notes"
      desc="조문 · 판례 · 문제 뷰어에서 작성한 포스트잇이 모입니다. 최근 수정 순으로 정렬됩니다."
      printHref="/study/notes/print"
      summaryStats={[
        { label: "전체", value: counts.total, dotClass: "bg-primary" },
        { label: "조문", value: counts.article, dotClass: "bg-primary" },
        { label: "판례", value: counts.case, dotClass: "bg-violet-500" },
        { label: "문제", value: counts.problem, dotClass: "bg-amber-500" },
      ]}
    >
      <FilterBar
        hasActive={hasActive}
        onReset={reset}
        search={{
          value: q,
          onChange: setQ,
          placeholder: "포스트잇 본문·발췌 검색",
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
            icon={StickyNoteIcon}
            tone="neutral"
            title="아직 포스트잇이 없습니다"
            body="조문·판례·문제 뷰어 본문에 포스트잇을 남겨 보세요. 모은 포스트잇은 이 화면에서 한 번에 검색할 수 있습니다."
            cta={{ label: "학습 시작", to: "/dashboard" }}
          />
        ) : (
          <EmptyState
            icon={SearchIcon}
            tone="subdued"
            title="검색·필터에 해당하는 포스트잇이 없습니다"
            body="검색어를 줄이거나 필터를 풀어 보세요."
          />
        )
      ) : (
        <ListStack testid="notes-list">
          {items.map((m) => (
            <ResultCard key={m.memoId} to={m.href}>
              <CardHeaderRow
                type={m.targetType}
                lawName={subjectName(m.lawCode)}
                secondary={m.secondaryLabel}
                right={
                  <span className="text-muted-foreground text-[11px] tabular-nums">
                    {formatRelative(m.updatedAt)}
                  </span>
                }
              />
              <div className="mt-1.5 mb-2 text-[15px] font-bold tracking-tight">
                {m.primaryLabel}
              </div>
              {m.snippet ? (
                <div className="border-border bg-muted/50 text-muted-foreground mb-2 rounded-md border-l-[3px] px-3 py-2 text-[13px] leading-relaxed">
                  {m.snippet}
                </div>
              ) : null}
              <div className="border-primary bg-primary/[0.06] flex gap-2 rounded-lg border-l-[3px] px-3 py-2.5">
                <PencilLineIcon className="text-link mt-0.5 size-3.5 shrink-0" />
                <span className="text-foreground/90 text-[13.5px] leading-relaxed whitespace-pre-line">
                  {m.bodyMd}
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
