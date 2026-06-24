// 오답노트 — 가장 최근 시도가 오답인 문제 큐. 객관식 + 정오문제(OX) 2섹션.
// 키트 lidam-study-aids/WrongNoteScreen 디자인.
import type { Route } from "./+types/wrong-note";

import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
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
  SectionTitle,
  SessionBanner,
  inRangeSelection,
  isRangeSelectionAll,
  subjectName,
} from "~/features/study/components/study-aids-list";
import {
  StudyAidsShell,
  toTabCounts,
} from "~/features/study/components/study-aids-shell";
import {
  getStudyAidCounts,
  listOxWrongAttempts,
  listWrongAttempts,
} from "~/features/study/queries.server";
import {
  FIRST_EXAM_LAW_SLUGS,
  LAW_SUBJECTS,
  SECOND_EXAM_LAW_SLUGS,
} from "~/features/subjects/lib/subjects";

export const meta: Route.MetaFunction = () => [
  { title: "오답노트 | 리담변리사학원" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const [items, oxItems, aidCounts] = await Promise.all([
    listWrongAttempts(client, user.id),
    listOxWrongAttempts(client, user.id),
    getStudyAidCounts(client, user.id),
  ]);
  return { items, oxItems, aidCounts };
}

// 대표 조문 + 연도/문항 → 카드 부가 라벨.
function metaLine(
  article: string | null,
  year: number | null,
  num: number | null,
): string | null {
  const y = year ? `${year}년${num ? ` ${num}번` : ""}` : null;
  return [article, y].filter(Boolean).join(" · ") || null;
}

function AttemptChip({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[11px] font-semibold text-rose-600 tabular-nums dark:text-rose-400">
      <TriangleAlertIcon className="size-3" />
      시도 {count}회
    </span>
  );
}

export default function WrongNote({ loaderData }: Route.ComponentProps) {
  const { items, oxItems, aidCounts } = loaderData;
  const [subject, setSubject] = useState<string | null>(null);
  const [rangeSel, setRangeSel] = useState<RangeSelection>(ALL_RANGE_SELECTION);

  const mcq = items.filter((p) => {
    if (subject && p.lawCode !== subject) return false;
    if (!inRangeSelection(p.lastAttemptedAt, rangeSel)) return false;
    return true;
  });
  const ox = oxItems.filter((o) => {
    if (subject && o.lawCode !== subject) return false;
    if (!inRangeSelection(o.lastAttemptedAt, rangeSel)) return false;
    return true;
  });

  return (
    <StudyAidsShell
      active="wrong"
      tabCounts={toTabCounts(aidCounts)}
      title="오답노트"
      desc="전체 과목 오답 모음 — 가장 최근 시도가 오답인 항목만 모입니다. 다시 풀어 정답이면 자동으로 빠집니다."
      printHref="/study/wrong-note/print"
      summaryStats={[
        { label: "객관식 오답", value: items.length, dotClass: "bg-rose-500" },
        {
          label: "정오문제 오답",
          value: oxItems.length,
          dotClass: "bg-amber-500",
        },
      ]}
    >
      <FilterBar
        hasActive={subject !== null || !isRangeSelectionAll(rangeSel)}
        onReset={() => {
          setSubject(null);
          setRangeSel(ALL_RANGE_SELECTION);
        }}
      >
        <FilterGroup label="1차 과목">
          <FilterChip
            selected={subject === null}
            onClick={() => setSubject(null)}
          >
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
        <RangeSelectionGroup
          value={rangeSel}
          onChange={setRangeSel}
          label="최근 시도"
        />
      </FilterBar>

      {mcq.length > 0 ? (
        <SessionBanner
          action="/api/study/session-from-wrong"
          count={mcq.length}
          hint="학습 모드는 즉시 해설, 시험 모드는 타이머·일괄 채점."
          testidPrefix="wrong-start"
          hidden={
            subject !== null ? (
              <input type="hidden" name="subject" value={subject} />
            ) : null
          }
        />
      ) : null}

      <section>
        <SectionTitle title="객관식 오답" count={mcq.length} />
        {mcq.length === 0 ? (
          <EmptyState
            icon={CircleCheckIcon}
            tone="celebrate"
            title="객관식 오답이 없습니다"
            body="문제를 풀어 보세요. 가장 최근 시도가 오답인 문제만 이 노트에 모입니다."
            cta={{ label: "문제 풀이 시작", to: "/dashboard" }}
          />
        ) : (
          <ListStack>
            {mcq.map((p) => (
              <ResultCard
                key={p.problemId}
                to={`/subjects/${p.lawCode}/problems/${p.problemId}`}
              >
                <CardHeaderRow
                  type="problem"
                  lawName={subjectName(p.lawCode)}
                  secondary={metaLine(
                    p.primaryArticleLabel,
                    p.year,
                    p.problemNumber,
                  )}
                  right={<AttemptChip count={p.attempts} />}
                />
                <p className="text-foreground/90 mt-1 text-sm leading-relaxed">
                  {p.bodySnippet}
                </p>
                <CardCta label="다시 풀기" />
              </ResultCard>
            ))}
          </ListStack>
        )}
      </section>

      <section data-testid="ox-wrong-section">
        <SectionTitle title="정오문제 오답" count={ox.length} />
        {ox.length > 0 ? (
          <div className="-mt-1 mb-3">
            <Link
              to="/me/ox-wrong-note"
              prefetch="intent"
              className="text-link inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              정오문제 오답 다시 풀기 →
            </Link>
          </div>
        ) : null}
        {ox.length === 0 ? (
          <EmptyState
            icon={CircleCheckIcon}
            tone="celebrate"
            title="정오문제 오답이 없습니다"
            body="정오문제 무작위 풀이에서 틀린 지문이 자동으로 모이는 곳입니다."
          />
        ) : (
          <ListStack>
            {ox.map((o) => (
              <ResultCard
                key={`${o.refType}:${o.refId}`}
                to={
                  o.articleNumber
                    ? `/subjects/${o.lawCode}/articles/${o.articleNumber}`
                    : `/subjects/${o.lawCode}/problems/${o.problemId}`
                }
              >
                <CardHeaderRow
                  type="ox"
                  lawName={subjectName(o.lawCode)}
                  secondary={metaLine(
                    o.primaryArticleLabel,
                    o.year,
                    o.problemNumber,
                  )}
                  right={<AttemptChip count={o.attempts} />}
                />
                <p className="text-foreground/90 mt-1 text-sm leading-relaxed">
                  {o.bodySnippet}
                </p>
                <div className="border-border bg-muted/40 mt-2 flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                  <OxPill label="내 답" value={o.myAnswer} kind="wrong" />
                  <span
                    aria-hidden
                    className="text-muted-foreground text-xs font-semibold"
                  >
                    vs
                  </span>
                  <OxPill label="정답" value={o.oxTruth} kind="correct" />
                </div>
                <CardCta
                  label={o.articleNumber ? "조문에서 다시 풀기" : "원문제 보기"}
                />
              </ResultCard>
            ))}
          </ListStack>
        )}
      </section>
    </StudyAidsShell>
  );
}

function OxPill({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind: "correct" | "wrong";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground text-[11px] font-semibold">
        {label}
      </span>
      <span
        className={
          kind === "correct"
            ? "inline-flex size-6 items-center justify-center rounded-md bg-emerald-500/15 text-sm font-extrabold text-emerald-600 dark:text-emerald-400"
            : "inline-flex size-6 items-center justify-center rounded-md bg-rose-500/15 text-sm font-extrabold text-rose-600 dark:text-rose-400"
        }
      >
        {value}
      </span>
    </span>
  );
}
