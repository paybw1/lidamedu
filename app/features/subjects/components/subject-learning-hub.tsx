// 과목 첫 화면 학습 허브 — 조문·판례·문제 3축을 한 화면에서 안내한다.
// 조문 책갈피 탭의 랜딩 본문. loader(loadSubjectHub)가 이미 주는 데이터
// (progress·recommendedArticles·cases·problemStats)만으로 구성 — 추가 쿼리 없음.

import {
  ArrowRightIcon,
  BookmarkIcon,
  GavelIcon,
  ListChecksIcon,
  SparklesIcon,
  StarIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router";

import { cn } from "~/core/lib/utils";
import type { CaseListItem } from "~/features/cases/labels";
import type { ProblemListItem } from "~/features/problems/labels";
import type {
  RecommendedArticleItem,
  SubjectProgress,
  UserProblemStats,
} from "~/features/study/queries.server";

import type { LawSubjectMeta } from "../lib/subjects";

type Accent = "primary" | "violet" | "emerald" | "amber";

const ACCENT: Record<Accent, string> = {
  primary: "bg-primary/10 text-link",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function SubjectLearningHub({
  subject,
  articleCount,
  progress,
  recommendedArticles,
  cases,
  casesTotal,
  problems,
  problemStats,
}: {
  subject: LawSubjectMeta;
  articleCount: number;
  progress: SubjectProgress | null;
  recommendedArticles: RecommendedArticleItem[];
  cases: CaseListItem[];
  casesTotal: number;
  problems: ProblemListItem[];
  problemStats: UserProblemStats | null;
}) {
  const importantCases = cases.filter((c) => c.importance >= 3);
  const examCases = cases.filter(
    (c) => c.exam1stProblems.length + c.exam2ndYears.length > 0,
  );

  const attempted = problemStats?.attemptedCount ?? 0;
  const correct = problemStats?.correctCount ?? 0;
  const wrong = problemStats?.wrongCount ?? 0;
  const accuracyPct =
    attempted > 0 ? Math.round((correct / attempted) * 100) : null;

  const topArticles = recommendedArticles.slice(0, 4);
  const topCases = importantCases.slice(0, 3);

  return (
    <div className="min-w-0 space-y-4">
      {/* 오늘의 학습 추천 — "이어서 학습" 블록은 SubjectStudyStatus 의
          "마지막 학습 조문" 카드와 중복이라 제거함. */}
      <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
        <p className="text-muted-foreground mb-1 inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
          <SparklesIcon className="text-link size-3.5" /> 오늘의 학습 추천
        </p>
        <div className="divide-border divide-y">
          <RecRow icon={BookmarkIcon} accent="primary" label="아직 안 본 중요 조문">
            {topArticles.length > 0 ? (
              <ul
                className="mt-1.5 flex flex-wrap gap-1.5"
                data-testid="recommended-articles"
              >
                {topArticles.map((a) => (
                  <li key={a.articleId}>
                    <Link
                      to={`/subjects/${subject.slug}/articles/${a.pathSlug}`}
                      viewTransition
                      prefetch="intent"
                      title={a.displayLabel}
                      className="border-border bg-primary/[0.06] text-link hover:border-primary inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold"
                    >
                      {a.importance >= 2 ? (
                        <StarIcon className="size-3 fill-current" />
                      ) : null}
                      {a.displayLabel}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-muted-foreground mt-1 text-xs"
                data-testid="recommended-articles"
              >
                모든 조문을 한 번씩 열어봤습니다 🎉
              </p>
            )}
          </RecRow>

          {topCases.length > 0 ? (
            <RecRow icon={GavelIcon} accent="violet" label="꼭 봐야 할 중요 판례">
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {topCases.map((c) => (
                  <li key={c.caseId}>
                    <Link
                      to={`/subjects/${subject.slug}/cases/${c.caseId}`}
                      viewTransition
                      prefetch="intent"
                      className="border-border inline-flex max-w-[260px] items-center truncate rounded-full border bg-violet-500/[0.07] px-2.5 py-1 text-xs font-semibold text-violet-700 hover:border-violet-500 dark:text-violet-300"
                    >
                      {c.summaryFirstTitle ?? c.summaryTitle ?? c.caseTitle}
                    </Link>
                  </li>
                ))}
              </ul>
            </RecRow>
          ) : null}

          {wrong > 0 ? (
            <RecRow
              icon={TriangleAlertIcon}
              accent="amber"
              label="복습이 필요한 문제"
            >
              <Link
                to={`/study/wrong-note?subject=${subject.slug}`}
                viewTransition
                className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold text-amber-700 dark:text-amber-400"
              >
                오답 {wrong.toLocaleString("ko-KR")}문제 다시 풀기
                <ArrowRightIcon className="size-3.5" />
              </Link>
            </RecRow>
          ) : null}
        </div>
      </div>

    </div>
  );
}

// 3축 현황 카드 — 판례·문제용. 클릭 시 해당 책갈피 탭으로 이동.
function AxisCard({
  to,
  icon: Icon,
  accent,
  name,
  cta,
  value,
  unit,
  sub,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
  name: string;
  cta: string;
  value: string;
  unit: string;
  sub: string;
}) {
  return (
    <Link
      to={to}
      preventScrollReset
      className="group border-border bg-card hover:border-primary rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-[9px]",
              ACCENT[accent],
            )}
          >
            <Icon className="size-[17px]" />
          </span>
          <span className="text-sm font-extrabold">{name}</span>
        </span>
        <span className="text-link inline-flex items-center gap-0.5 text-[11px] font-bold">
          {cta}
          <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <p className="text-foreground mt-3 text-[25px] leading-none font-extrabold tracking-tight tabular-nums">
        {value}
        {unit ? (
          <span className="text-muted-foreground text-sm font-bold">
            {unit}
          </span>
        ) : null}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{sub}</p>
    </Link>
  );
}

// 학습 추천 한 줄 — 아이콘 + 라벨 + 내용(칩/링크).
function RecRow({
  icon: Icon,
  accent,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: Accent;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-3">
      <span
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-lg",
          ACCENT[accent],
        )}
      >
        <Icon className="size-[15px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs font-semibold">{label}</p>
        {children}
      </div>
    </div>
  );
}
