// 과목 학습 현황 — 도넛 3개(조문/판례/문제) + 마지막 학습·즐겨찾기·메모를
// 한 카드로 결합한 행. 헤더에서 빠져나와 각 탭의 우측 본문 컬럼 최상단에
// 직접 표시한다(좌측 책갈피 레일·트리와 같은 행).
//
// 오답 카운트는 SubjectLearningHub 의 "복습이 필요한 문제" 와 중복이라
// 의도적으로 제외. 추가 데이터 페치 없이 loader 가 이미 주는 progress·
// problemStats·bookmarkLevels·annotationCounts 만 재사용한다.

import {
  ArrowRightIcon,
  BookOpenIcon,
  CircleCheckIcon,
  GavelIcon,
  PencilLineIcon,
  StarIcon,
} from "lucide-react";
import { Link } from "react-router";

import type {
  SubjectProgress,
  UserProblemStats,
} from "~/features/study/queries.server";

import type { LawSubjectMeta } from "../lib/subjects";

export interface SubjectStudyStatusProps {
  subject: LawSubjectMeta;
  progress: SubjectProgress | null;
  problemStats: UserProblemStats | null;
  problemTotal: number;
  bookmarkCount: number;
  annotationCount: number;
}

export function SubjectStudyStatus({
  subject,
  progress,
  problemStats,
  problemTotal,
  bookmarkCount,
  annotationCount,
  kind = "article",
}: SubjectStudyStatusProps & {
  // 어느 탭의 "마지막 학습"인지 — 조문/판례/문제. 데이터(progress)는 공유.
  kind?: "article" | "case" | "problem";
}) {
  const articlePct = clampPct(progress?.pctViewed);
  const casesPct = clampPct(progress?.pctCasesViewed);
  const visitedArticles = progress?.visitedArticleIds.size ?? 0;
  const totalArticles = progress?.totalArticleCount ?? 0;
  const visitedCases = progress?.visitedCaseIds.size ?? 0;
  const totalCases = progress?.totalCaseCount ?? 0;
  const attempted = problemStats?.attemptedCount ?? 0;
  const correct = problemStats?.correctCount ?? 0;
  const accuracyPct =
    attempted > 0 ? Math.round((correct / attempted) * 100) : null;
  // 탭 종류별 "마지막 학습" — 조문/판례/문제. 라벨·표시·이어서 링크를 분기.
  const StudyIcon =
    kind === "case"
      ? GavelIcon
      : kind === "problem"
        ? CircleCheckIcon
        : BookOpenIcon;
  let lastLabel: string;
  let lastDisplay: string | null;
  let continueHref: string | null;
  if (kind === "case") {
    lastLabel = "마지막 학습 판례";
    lastDisplay = progress?.lastCase?.displayLabel ?? null;
    continueHref = progress?.lastCase
      ? `/subjects/${subject.slug}/cases/${progress.lastCase.caseId}`
      : null;
  } else if (kind === "problem") {
    lastLabel = "마지막 학습 문제";
    lastDisplay = progress?.lastProblem?.displayLabel ?? null;
    continueHref = progress?.lastProblem
      ? `/subjects/${subject.slug}/problems/${progress.lastProblem.problemId}`
      : null;
  } else {
    lastLabel = "마지막 학습 조문";
    lastDisplay = progress?.lastVisited?.displayLabel ?? null;
    continueHref = progress?.lastVisited?.articleNumber
      ? `/subjects/${subject.slug}/articles/${progress.lastVisited.articleNumber}`
      : null;
  }

  return (
    <section
      aria-labelledby="subject-stat-heading"
      className="border-border bg-muted/40 rounded-xl border p-5"
    >
      <h2
        id="subject-stat-heading"
        className="text-muted-foreground font-mono text-[11px] font-bold tracking-[0.08em] uppercase"
      >
        내 학습 현황
      </h2>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <ProgressDonut
          label="조문 진도"
          pct={articlePct}
          frac={`${visitedArticles.toLocaleString("ko-KR")} / ${totalArticles.toLocaleString("ko-KR")}`}
          tone="primary"
        />
        <ProgressDonut
          label="판례 학습"
          pct={casesPct}
          frac={`${visitedCases.toLocaleString("ko-KR")} / ${totalCases.toLocaleString("ko-KR")}`}
          tone="violet"
        />
        <ProgressDonut
          label="문제 정답률"
          pct={accuracyPct}
          frac={
            attempted > 0
              ? `${attempted.toLocaleString("ko-KR")} 풀이`
              : `${problemTotal.toLocaleString("ko-KR")} 문제`
          }
          tone="emerald"
        />
      </div>

      {/* 마지막 학습 + 활동 통계(즐겨찾기·메모) 한 카드. 한 행에 inline 으로
          배치되며 폭이 부족하면 자동 wrap. 오답은 학습 허브의 "복습이 필요한
          문제" 와 중복이라 제외. */}
      <div className="bg-card border-border mt-4 flex flex-col gap-3 rounded-xl border p-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-3">
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
          <span
            className="bg-primary/10 text-link inline-flex size-9 shrink-0 items-center justify-center rounded-lg"
            aria-hidden="true"
          >
            <StudyIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-muted-foreground font-mono text-[10px] font-bold tracking-[0.1em] uppercase">
              {lastLabel}
            </p>
            <p className="text-foreground mt-0.5 truncate text-[15px] font-extrabold leading-tight">
              {lastDisplay ?? "아직 학습 시작 전"}
            </p>
          </div>
        </div>

        <div className="text-muted-foreground flex shrink-0 items-center gap-x-3.5 text-[12px]">
          <span className="inline-flex items-center gap-1.5">
            <StarIcon className="size-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-foreground font-extrabold tabular-nums">
              {bookmarkCount.toLocaleString("ko-KR")}
            </span>
            <span>즐겨찾기</span>
          </span>
          <span className="text-border" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PencilLineIcon className="text-link size-3.5" />
            <span className="text-foreground font-extrabold tabular-nums">
              {annotationCount.toLocaleString("ko-KR")}
            </span>
            <span>메모</span>
          </span>
        </div>

        {continueHref ? (
          <Link
            to={continueHref}
            viewTransition
            prefetch="intent"
            className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-[12px] font-bold shadow-sm transition-opacity hover:opacity-90"
          >
            이어서 보기 <ArrowRightIcon className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function clampPct(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

const DONUT_STROKE: Record<"primary" | "violet" | "emerald", string> = {
  primary: "stroke-primary",
  violet: "stroke-violet-600 dark:stroke-violet-400",
  emerald: "stroke-emerald-600 dark:stroke-emerald-400",
};

// SVG 진도 도넛 — pathLength=100 으로 dasharray 를 그대로 % 값으로 쓴다.
// pct=null 이면 호 미표시 + "—" 라벨.
function ProgressDonut({
  label,
  pct,
  frac,
  tone,
}: {
  label: string;
  pct: number | null;
  frac: string;
  tone: "primary" | "violet" | "emerald";
}) {
  const value = pct ?? 0;
  return (
    <figure className="flex flex-col items-center">
      <svg
        viewBox="0 0 120 120"
        className="w-full max-w-[120px]"
        role="img"
        aria-label={`${label} ${pct === null ? "데이터 없음" : `${pct}%`}`}
      >
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          strokeWidth="12"
          className="stroke-border"
        />
        {pct !== null ? (
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            strokeWidth="12"
            strokeLinecap="round"
            className={DONUT_STROKE[tone]}
            strokeDasharray={`${value} 100`}
            pathLength={100}
            transform="rotate(-90 60 60)"
          />
        ) : null}
        <text
          x="60"
          y="58"
          textAnchor="middle"
          className="fill-foreground tabular-nums"
          style={{ fontSize: 24, fontWeight: 800 }}
        >
          {pct === null ? "—" : `${pct}%`}
        </text>
        <text
          x="60"
          y="76"
          textAnchor="middle"
          className="fill-muted-foreground tabular-nums"
          style={{ fontSize: 10 }}
        >
          {frac}
        </text>
      </svg>
      <figcaption className="text-foreground mt-1 text-center text-[13px] font-extrabold">
        {label}
      </figcaption>
    </figure>
  );
}

