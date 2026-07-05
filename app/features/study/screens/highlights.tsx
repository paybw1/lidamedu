// 하이라이트 — 본문에 색칠한 발췌 모아보기. 최근 작성 순.
// 키트 lidam-study-aids/HighlightsScreen 디자인.
import type { Route } from "./+types/highlights";

import { HighlighterIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { HighlightColorAliasEditor } from "~/features/annotations/components/highlight-color-alias-editor";
import {
  HIGHLIGHT_COLORS,
  type HighlightColor,
  highlightColorLabel,
} from "~/features/annotations/labels";
import {
  getHighlightColorAliases,
  listAllHighlights,
} from "~/features/annotations/queries.server";
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
  { title: "하이라이트 | 리담변리사학원" },
];

// 4색 + 밑줄 — 사용자 데이터이므로 다색 유지 (brief §4.3). 밑줄(underline) 은
// 배경 없이 텍스트 데코레이션만 (feat-3-207).
const COLOR: Record<
  HighlightColor,
  { label: string; box: string; bar: string; dot: string }
> = {
  yellow: {
    label: "노랑",
    box: "bg-amber-100 dark:bg-amber-950/40",
    bar: "border-amber-400",
    dot: "bg-amber-400",
  },
  green: {
    label: "초록",
    box: "bg-emerald-100 dark:bg-emerald-950/40",
    bar: "border-emerald-500",
    dot: "bg-emerald-500",
  },
  red: {
    label: "빨강",
    box: "bg-rose-100 dark:bg-rose-950/40",
    bar: "border-rose-400",
    dot: "bg-rose-400",
  },
  blue: {
    label: "파랑",
    box: "bg-sky-100 dark:bg-sky-950/40",
    bar: "border-sky-400",
    dot: "bg-sky-400",
  },
  underline: {
    label: "밑줄",
    box: "bg-background dark:bg-background",
    bar: "border-foreground/40",
    dot: "bg-foreground/60",
  },
};

type TypeFilter = "article" | "case" | "problem" | "ox";

const TYPE_OPTIONS = [
  ["article", "조문"],
  ["case", "판례"],
  ["problem", "문제"],
  ["ox", "정오문제"],
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, aidCounts, aliases] = await Promise.all([
    listAllHighlights(client, user.id),
    getStudyAidCounts(client, user.id),
    getHighlightColorAliases(client, user.id),
  ]);
  const counts = {
    total: items.length,
    green: 0,
    yellow: 0,
    red: 0,
    blue: 0,
    underline: 0,
  };
  for (const h of items) counts[h.color] += 1;
  return { items, counts, aidCounts, aliases };
}

export default function Highlights({ loaderData }: Route.ComponentProps) {
  const { items: all, counts, aidCounts, aliases } = loaderData;
  // 색상별 표시 라벨 — alias 우선, 없으면 기본 색 이름.
  const labelFor = (c: HighlightColor) => highlightColorLabel(c, aliases);
  const [subject, setSubject] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter | null>(null);
  const [color, setColor] = useState<HighlightColor | null>(null);
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);
  const [q, setQ] = useState("");
  const hasActive =
    subject !== null ||
    type !== null ||
    color !== null ||
    !isRangeSelectionAll(rangeSel) ||
    q.trim() !== "";
  const reset = () => {
    setSubject(null);
    setType(null);
    setColor(null);
    setRangeSel(ALL_RANGE_SELECTION);
    setQ("");
  };

  const needle = q.trim().toLowerCase();
  const items = all.filter((h) => {
    if (subject && h.lawCode !== subject) return false;
    if (type === "ox") {
      if (
        h.targetType !== "problem_choice" &&
        h.targetType !== "problem_box_item"
      )
        return false;
    } else if (type && h.targetType !== type) return false;
    if (color && h.color !== color) return false;
    if (!inRangeSelection(h.createdAt, rangeSel)) return false;
    if (needle) {
      const hay = [h.excerpt, h.primaryLabel, h.secondaryLabel, h.bodySnippet]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  return (
    <StudyAidsShell
      active="highlights"
      tabCounts={toTabCounts(aidCounts)}
      title="하이라이트"
      desc="본문에 색칠한 발췌가 모이는 곳입니다. 최근 작성 순으로 정렬되며, 색상별로 좁혀 볼 수 있습니다."
      printHref="/study/highlights/print"
      summaryStats={[
        { label: "전체", value: counts.total },
        {
          label: labelFor("yellow"),
          value: counts.yellow,
          dotClass: COLOR.yellow.dot,
        },
        {
          label: labelFor("green"),
          value: counts.green,
          dotClass: COLOR.green.dot,
        },
        { label: labelFor("red"), value: counts.red, dotClass: COLOR.red.dot },
        {
          label: labelFor("blue"),
          value: counts.blue,
          dotClass: COLOR.blue.dot,
        },
        {
          label: labelFor("underline"),
          value: counts.underline,
          dotClass: COLOR.underline.dot,
        },
      ]}
    >
      <HighlightColorAliasEditor initial={aliases} />
      <FilterBar
        hasActive={hasActive}
        onReset={reset}
        search={{
          value: q,
          onChange: setQ,
          placeholder: "하이라이트 발췌 검색",
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
        <FilterGroup label="색상">
          <FilterChip selected={!color} onClick={() => setColor(null)}>
            전체
          </FilterChip>
          {HIGHLIGHT_COLORS.map((c) => (
            <FilterChip
              key={c}
              selected={color === c}
              onClick={() => setColor(c)}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", COLOR[c].dot)}
              />
              {labelFor(c)}
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterDivider />
        <RangeSelectionGroup value={rangeSel} onChange={setRangeSel} />
      </FilterBar>

      {items.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            icon={HighlighterIcon}
            tone="neutral"
            title="아직 하이라이트가 없습니다"
            body="본문에서 텍스트를 선택해 4색 중 하나로 색칠해 보세요. 색칠한 발췌가 이곳에 모입니다."
            cta={{ label: "학습 시작", to: "/dashboard" }}
          />
        ) : (
          <EmptyState
            icon={SearchIcon}
            tone="subdued"
            title="검색·필터에 해당하는 하이라이트가 없습니다"
            body="다른 색상이나 과목을 선택하거나 검색어를 줄여 보세요."
          />
        )
      ) : (
        <ListStack testid="highlights-list">
          {items.map((h) => {
            const c = COLOR[h.color];
            return (
              <ResultCard key={h.highlightId} to={h.href}>
                <CardHeaderRow
                  type={h.targetType}
                  lawName={subjectName(h.lawCode)}
                  secondary={h.secondaryLabel}
                  right={
                    <>
                      <span className="border-border inline-flex h-[22px] items-center gap-1 rounded-full border px-2 text-[11px] font-semibold">
                        <span
                          aria-hidden
                          className={cn("size-2 rounded-full", c.dot)}
                        />
                        {labelFor(h.color)}
                      </span>
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {formatRelative(h.createdAt)}
                      </span>
                    </>
                  }
                />
                <div className="mt-1.5 mb-1.5 text-[15px] font-bold tracking-tight">
                  {h.primaryLabel}
                </div>
                {h.bodySnippet ? (
                  <p className="text-muted-foreground mb-2 text-[13px] leading-relaxed">
                    {h.bodySnippet}
                  </p>
                ) : null}
                <div
                  className={cn(
                    "rounded-md border-l-[3px] px-3.5 py-2.5",
                    c.box,
                    c.bar,
                  )}
                >
                  {h.excerpt || h.beforeCtx || h.afterCtx ? (
                    <p className="text-sm leading-relaxed">
                      {h.beforeCtx ? (
                        <span className="text-muted-foreground">
                          …{h.beforeCtx}
                        </span>
                      ) : null}
                      <span className="text-foreground font-semibold">
                        {h.excerpt || "(발췌 없음)"}
                      </span>
                      {h.afterCtx ? (
                        <span className="text-muted-foreground">
                          {h.afterCtx}…
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <span className="text-muted-foreground text-[13px] italic">
                      (발췌 텍스트 없음)
                    </span>
                  )}
                </div>
                <CardCta label="원문에서 보기" />
              </ResultCard>
            );
          })}
        </ListStack>
      )}
    </StudyAidsShell>
  );
}
