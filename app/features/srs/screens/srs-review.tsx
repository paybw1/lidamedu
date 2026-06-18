// SRS v2 ④ — /srs 카드 복습 화면.
// 앞면 표시 → "정답 보기" → 뒷면 + 4 grade 버튼 → 다음 카드.
// elapsed_ms = 카드 표시 시점 ~ grade 클릭까지 ms.

import type { Route } from "./+types/srs-review";

import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ClockIcon,
  EyeIcon,
  RotateCcwIcon,
  SparklesIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, redirect, useFetcher } from "react-router";

import { StudyMgmtTabs } from "~/features/study/components/study-mgmt-tabs";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { hasMyAnalysisConsent } from "~/features/exam-results/queries.server";
import { MyAnalysisOffNotice } from "~/features/study/components/my-analysis-off-notice";
import {
  getDueCountsByType,
  getReviewQueue,
  isKindBacklogged,
} from "~/features/srs/srs.server";
import {
  LAW_SUBJECTS,
  LAW_SUBJECT_SLUGS,
  type LawSubjectSlug,
} from "~/features/subjects/lib/subjects";

function subjectLabel(slug: string): string {
  return (
    LAW_SUBJECTS[slug as LawSubjectSlug]?.shortName ?? slug
  );
}

export const meta: Route.MetaFunction = () => [
  { title: "암기 카드 | 리담" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login?next=/srs");
  // feat-8-026b A 게이트 — 미동의/철회 시 암기 미표시(데이터는 보존, 재동의 시 복구).
  if (!(await hasMyAnalysisConsent(client, user.id))) {
    return { myAnalysisOff: true as const };
  }
  // feat-2-024 — 종류(조문/판례)·과목 필터 + 종류별 밀림 배지.
  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const subjectParam = url.searchParams.get("subject");
  const sourceType =
    typeParam === "article" || typeParam === "case" ? typeParam : null;
  const subject =
    subjectParam &&
    (LAW_SUBJECT_SLUGS as readonly string[]).includes(subjectParam)
      ? subjectParam
      : null;
  const [queue, dueByType] = await Promise.all([
    getReviewQueue(client, user.id, { sourceType, subject }),
    getDueCountsByType(client, user.id),
  ]);
  return {
    myAnalysisOff: false as const,
    ...queue,
    filter: { sourceType, subject },
    cardDue: {
      article: {
        due: dueByType.article.due,
        backlogged: isKindBacklogged(dueByType.article),
      },
      case: {
        due: dueByType.case.due,
        backlogged: isKindBacklogged(dueByType.case),
      },
    },
  };
}

type Grade = 0 | 3 | 4 | 5;

interface GradeButtonSpec {
  grade: Grade;
  label: string;
  shortcut: string;
  tone: string;
}

const GRADES: GradeButtonSpec[] = [
  {
    grade: 0,
    label: "다시 외우기",
    shortcut: "1",
    tone: "bg-rose-500 hover:bg-rose-600 text-white",
  },
  {
    grade: 3,
    label: "어려웠음",
    shortcut: "2",
    tone: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  {
    grade: 4,
    label: "보통",
    shortcut: "3",
    tone: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
  {
    grade: 5,
    label: "쉬웠음",
    shortcut: "4",
    tone: "bg-sky-500 hover:bg-sky-600 text-white",
  },
];

export default function SrsReview({ loaderData }: Route.ComponentProps) {
  if (loaderData.myAnalysisOff)
    return <MyAnalysisOffNotice feature="암기 카드" />;
  return <SrsReviewInner data={loaderData} />;
}

function SrsReviewInner({
  data,
}: {
  data: Extract<Route.ComponentProps["loaderData"], { myAnalysisOff: false }>;
}) {
  const { today, items, dueCount, newCount, newIntroducedToday, settings } =
    data;
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const shownAtRef = useRef<number>(Date.now());
  const fetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    result?: { newState: string; newInterval: number; newDueDate: string };
  }>();

  // 카드 진입 시 타이머 리셋.
  useEffect(() => {
    shownAtRef.current = Date.now();
    setFlipped(false);
  }, [cursor]);

  // 제출 성공 시 다음 카드로 진행.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      setCursor((c) => c + 1);
    }
  }, [fetcher.state, fetcher.data]);

  // 키보드 단축키 — Space=뒤집기, 1/2/3/4=채점.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (!flipped) {
        if (e.code === "Space") {
          e.preventDefault();
          setFlipped(true);
        }
        return;
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (idx >= 0 && fetcher.state === "idle") {
        e.preventDefault();
        submit(GRADES[idx].grade);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, cursor, fetcher.state]);

  const current = items[cursor];
  const done = cursor >= items.length;
  const progress = useMemo(
    () => ({ done: cursor, total: items.length }),
    [cursor, items.length],
  );

  function submit(grade: Grade) {
    if (!current) return;
    const elapsedMs = Date.now() - shownAtRef.current;
    const form = new FormData();
    form.set("itemId", current.itemId);
    form.set("grade", String(grade));
    form.set("elapsedMs", String(elapsedMs));
    fetcher.submit(form, {
      method: "post",
      action: "/api/srs/review",
    });
  }

  return (
    <>
      <StudyMgmtTabs />
    <div className="mx-auto w-full max-w-screen-md px-4 py-8 md:py-12">
      {/* 헤더 */}
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-primary inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase">
            <SparklesIcon className="size-3" />
            암기 카드 · {today}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            오늘의 암기 카드
          </h1>
        </div>
        <Link
          to="/srs/stats"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
        >
          통계
        </Link>
      </header>

      <ChipFilters filter={data.filter} cardDue={data.cardDue} />

      {/* 카드 카운터 */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Counter label="오늘 암기" value={dueCount} tone="rose" />
        <Counter
          label="새 카드"
          value={newCount}
          tone="sky"
          hint={`오늘 ${newIntroducedToday}/${settings.newPerDay}`}
        />
        <Counter label="진행" value={`${progress.done}/${progress.total}`} tone="neutral" />
        <Counter
          label="남은 카드"
          value={Math.max(0, progress.total - progress.done)}
          tone="amber"
        />
      </div>

      {/* 본문 */}
      {done ? (
        <CompleteCard total={items.length} />
      ) : current ? (
        <CardArea
          item={current}
          flipped={flipped}
          submitting={fetcher.state !== "idle"}
          onFlip={() => setFlipped(true)}
          onGrade={submit}
        />
      ) : (
        <EmptyCard />
      )}

      {/* 알림 */}
      {fetcher.data?.error ? (
        <p className="mt-3 text-center text-xs text-rose-600 dark:text-rose-400">
          ✗ {fetcher.data.error}
        </p>
      ) : null}
    </div>
    </>
  );
}

/* ── 부속 컴포넌트 ────────────────────────────────────────────────── */

// feat-2-024 — 종류·과목 칩 필터(기본 전체) + 종류별 due 배지.
function srsHref(type: string | null, subject: string | null): string {
  const p = new URLSearchParams();
  if (type) p.set("type", type);
  if (subject) p.set("subject", subject);
  const s = p.toString();
  return s ? `/srs?${s}` : "/srs";
}

function FilterChip({
  active,
  to,
  children,
}: {
  active: boolean;
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      preventScrollReset
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:border-primary hover:text-primary",
      )}
    >
      {children}
    </Link>
  );
}

function DueBadge({ stat }: { stat: { due: number; backlogged: boolean } }) {
  if (stat.due <= 0) return null;
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
        stat.backlogged
          ? "bg-rose-500 text-white"
          : "bg-muted text-muted-foreground",
      )}
    >
      {stat.due}
    </span>
  );
}

function ChipFilters({
  filter,
  cardDue,
}: {
  filter: { sourceType: string | null; subject: string | null };
  cardDue: {
    article: { due: number; backlogged: boolean };
    case: { due: number; backlogged: boolean };
  };
}) {
  const { sourceType, subject } = filter;
  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          종류
        </span>
        <FilterChip active={sourceType === null} to={srsHref(null, subject)}>
          전체
        </FilterChip>
        <FilterChip
          active={sourceType === "article"}
          to={srsHref("article", subject)}
        >
          조문
          <DueBadge stat={cardDue.article} />
        </FilterChip>
        <FilterChip
          active={sourceType === "case"}
          to={srsHref("case", subject)}
        >
          판례
          <DueBadge stat={cardDue.case} />
        </FilterChip>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-[11px] font-semibold">
          과목
        </span>
        <FilterChip active={subject === null} to={srsHref(sourceType, null)}>
          전체
        </FilterChip>
        {LAW_SUBJECT_SLUGS.map((slug) => (
          <FilterChip
            key={slug}
            active={subject === slug}
            to={srsHref(sourceType, slug)}
          >
            {subjectLabel(slug)}
          </FilterChip>
        ))}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  tone: "rose" | "sky" | "amber" | "neutral";
  hint?: string;
}) {
  const cls =
    tone === "rose"
      ? "border-rose-300/60 bg-rose-50/60 text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300"
      : tone === "sky"
        ? "border-sky-300/60 bg-sky-50/60 text-sky-700 dark:border-sky-700/40 dark:bg-sky-950/30 dark:text-sky-300"
        : tone === "amber"
          ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
          : "border-border bg-card text-muted-foreground";
  return (
    <div className={cn("rounded-xl border p-3", cls)}>
      <p className="font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1 text-xl font-extrabold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-[10px]">{hint}</p>
      ) : null}
    </div>
  );
}

type Item = Extract<
  Route.ComponentProps["loaderData"],
  { myAnalysisOff: false }
>["items"][number];

function CardArea({
  item,
  flipped,
  submitting,
  onFlip,
  onGrade,
}: {
  item: Item;
  flipped: boolean;
  submitting: boolean;
  onFlip: () => void;
  onGrade: (g: Grade) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="bg-primary/10 text-primary inline-flex h-5 items-center rounded-full px-2 font-mono text-[10px] font-bold tracking-[0.04em] uppercase">
            {subjectLabel(item.subject)}
          </span>
          {item.topic ? (
            <span className="text-muted-foreground text-[11px]">
              {item.topic}
            </span>
          ) : null}
          {item.kind === "new" ? (
            <span className="ml-auto bg-sky-500/15 text-sky-700 dark:text-sky-300 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold">
              새 카드
            </span>
          ) : (
            <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-[10px] tabular-nums">
              <ClockIcon className="size-2.5" />
              {item.intervalDays}일 간격
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Front */}
        <div className="border-border bg-muted/30 rounded-lg border p-5">
          <p className="text-muted-foreground mb-2 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
            앞면 (질문)
          </p>
          <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-line">
            {item.front}
          </p>
          {item.lawRef ? (
            <p className="text-muted-foreground mt-2 font-mono text-[11px]">
              관련 조문: {item.lawRef}
            </p>
          ) : null}
        </div>

        {/* Back (flipped) */}
        {flipped ? (
          <div className="border-primary/30 bg-primary/5 mt-3 rounded-lg border p-5">
            <p className="text-primary mb-2 font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              뒷면 (정답)
            </p>
            <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-line">
              {item.back}
            </p>
          </div>
        ) : null}

        {/* Action */}
        {!flipped ? (
          <div className="mt-4 flex justify-center">
            <Button
              type="button"
              size="lg"
              onClick={onFlip}
              className="gap-2"
            >
              <EyeIcon className="size-4" />
              정답 보기
              <span className="text-primary-foreground/60 ml-1 font-mono text-[10px]">
                Space
              </span>
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-muted-foreground mb-2 text-center font-mono text-[10px] font-bold tracking-[0.06em] uppercase">
              얼마나 잘 떠올렸나요?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADES.map((g) => (
                <button
                  key={g.grade}
                  type="button"
                  onClick={() => onGrade(g.grade)}
                  disabled={submitting}
                  className={cn(
                    "h-12 rounded-lg text-sm font-bold transition-all disabled:opacity-50",
                    g.tone,
                  )}
                >
                  <span>{g.label}</span>
                  <span className="ml-1.5 font-mono text-[10px] opacity-70">
                    {g.shortcut}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompleteCard({ total }: { total: number }) {
  return (
    <Card className="border-emerald-300/60">
      <CardContent className="space-y-3 py-10 text-center">
        <CheckCircle2Icon className="mx-auto size-10 text-emerald-500" />
        <p className="text-foreground text-lg font-bold">오늘 암기 완료</p>
        <p className="text-muted-foreground text-sm">
          총 {total}건 처리. 통계에서 결과를 확인하세요.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/srs/stats">
              통계 보기 <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link to="/srs">
              <RotateCcwIcon className="size-3.5" /> 새로고침
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="text-muted-foreground space-y-2 py-10 text-center text-sm">
        <SparklesIcon className="mx-auto size-8 opacity-30" />
        <p>오늘 외울 카드가 없습니다.</p>
        <p className="text-xs">
          내일 다시 들어오면 일정에 따라 새 카드와 복습 카드가 자동으로
          올라옵니다.
        </p>
      </CardContent>
    </Card>
  );
}
