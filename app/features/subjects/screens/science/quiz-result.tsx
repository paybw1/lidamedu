// 자연과학 퀴즈 세션 결과 — 법률 quiz-result 의 경량판, 자과 허브·뷰어와 같은 톤.
// 정답률 KPI + 오답 배너 + 문항별 결과(클릭 = 그 문제 복습).

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleXIcon,
  ClockIcon,
  MinusCircleIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Form, Link, data } from "react-router";

import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getQuizSessionResult } from "~/features/study/queries.server";
import { ScienceSubjectBar } from "~/features/subjects/components/science-subject-bar";
import {
  SCIENCE_SUBJECTS,
  normalizeScienceSlug,
  scienceSubjectPath,
} from "~/features/subjects/lib/science";

import type { Route } from "./+types/quiz-result";

export const meta: Route.MetaFunction = ({ data: ld }) => {
  if (!ld) return [{ title: "퀴즈 결과 | 리담변리사학원" }];
  return [{ title: `${ld.subjectMeta.name} 퀴즈 결과 | 리담변리사학원` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subject = normalizeScienceSlug(params.scienceSubject ?? "");
  if (!subject) throw data("Unknown science subject", { status: 404 });
  if (!params.sessionId) throw data("Missing session id", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const result = await getQuizSessionResult(client, user.id, params.sessionId);
  if (!result || result.session.scienceSubject !== subject) {
    throw data("Session not found", { status: 404 });
  }

  return { scienceSubject: subject, subjectMeta: SCIENCE_SUBJECTS[subject], result };
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true) {
    return (
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle2Icon className="size-3.5" />
      </span>
    );
  }
  if (isCorrect === false) {
    return (
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
        <CircleXIcon className="size-3.5" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <MinusCircleIcon className="size-3.5" />
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  highlight,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "rose";
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 shadow-sm",
        highlight
          ? "border-primary/20 bg-primary/10 dark:border-primary/30 dark:bg-primary/15"
          : "bg-card",
      )}
    >
      <p className="text-muted-foreground mb-1.5 flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest uppercase">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-extrabold leading-none tracking-tight tabular-nums",
          tone === "rose"
            ? "text-rose-600 dark:text-rose-400"
            : highlight
              ? "text-link"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-1 text-[11px]">{hint}</p>
    </div>
  );
}

export default function ScienceQuizResult({ loaderData }: Route.ComponentProps) {
  const { scienceSubject, subjectMeta, result } = loaderData;
  const { session, items, attemptedCount, correctCount, totalTimeMs } = result;
  const total = items.length;
  const wrongCount = attemptedCount - correctCount;
  const skipped = total - attemptedCount;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;

  const sciencePath = scienceSubjectPath(scienceSubject);
  const hubHref = `/subjects/science?subject=${sciencePath}`;
  const setupAction = `/subjects/science/${sciencePath}/quiz/setup`;

  return (
    <div className="bg-background min-h-[calc(100vh-56px)]">
      <ScienceSubjectBar active={scienceSubject} />

      <div className="mx-auto w-full max-w-screen-md px-5 py-6 md:px-10 md:py-8 pb-20">
        <Link
          to={hubHref}
          viewTransition
          className="text-muted-foreground hover:text-foreground mb-5 inline-flex items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeftIcon className="size-4" /> {subjectMeta.name}
        </Link>

        {/* Header */}
        <header className="mb-6">
          <p className="text-link mb-1.5 font-mono text-[11px] font-bold tracking-widest uppercase">
            자연과학 퀴즈 결과
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              {subjectMeta.name} 퀴즈 결과
            </h1>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide",
                session.mode === "exam"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-primary/10 text-link",
              )}
            >
              {session.mode === "exam" ? "시험 모드" : "학습 모드"}
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold",
                session.completedAt
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {session.completedAt ? "완료" : "진행 중 (저장됨)"}
            </span>
          </div>
        </header>

        {/* KPI 4 */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="정답률"
            value={`${accuracyPct}%`}
            hint={`정답 ${correctCount} / 응답 ${attemptedCount}`}
            highlight
          />
          <KpiCard
            label="정답"
            value={`${correctCount}`}
            hint={skipped > 0 ? `미응답 ${skipped}` : "전부 응답"}
          />
          <KpiCard label="오답" value={`${wrongCount}`} hint="틀린 문항" tone="rose" />
          <KpiCard
            label="소요"
            value={totalTimeMs > 0 ? formatDuration(totalTimeMs) : "—"}
            hint="응답 합계"
            icon={<ClockIcon className="size-3 shrink-0" />}
          />
        </div>

        {/* 오답 배너 — 허브의 오답 카드와 같은 앰버 톤 */}
        {wrongCount > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-5 py-3.5 dark:border-amber-700/60 dark:bg-amber-950/40">
            <p className="flex-1 text-sm font-medium text-amber-900 dark:text-amber-100">
              오답 <span className="font-bold tabular-nums">{wrongCount}</span>
              문항 — 아래 목록에서 눌러 바로 복습할 수 있습니다.
            </p>
            <Form method="post" action={setupAction}>
              <input type="hidden" name="wrong" value="1" />
              <input type="hidden" name="mode" value="study" />
              <input type="hidden" name="count" value="150" />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/70 px-3.5 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                <RotateCcwIcon className="size-3.5" /> {subjectMeta.name} 오답
                전체 다시 풀기
              </button>
            </Form>
          </div>
        ) : null}

        {/* 문항별 결과 */}
        <div className="bg-card overflow-hidden rounded-xl border shadow-sm">
          <div className="border-b px-5 py-3.5">
            <h2 className="text-sm font-bold tracking-tight">
              문항별 결과{" "}
              <span className="text-muted-foreground font-normal">
                ({total})
              </span>
            </h2>
          </div>
          <ul className="divide-y">
            {items.map((it, idx) => (
              <li key={it.problemId}>
                <Link
                  to={`/subjects/science/${sciencePath}/problems/${it.problemId}`}
                  viewTransition
                  data-testid="science-result-row"
                  className="hover:bg-primary/[0.04] flex items-center gap-3 px-5 py-3 text-sm transition-colors"
                >
                  <ResultIcon isCorrect={it.isCorrect} />
                  {it.year ? (
                    <span className="bg-primary/10 text-link inline-flex h-[22px] shrink-0 items-center rounded-full px-2 font-mono text-[11px] font-semibold tabular-nums">
                      {it.year}
                      {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                    </span>
                  ) : (
                    <span className="bg-muted text-muted-foreground inline-flex h-[22px] shrink-0 items-center rounded-full px-2 font-mono text-[11px] tabular-nums">
                      {idx + 1}
                    </span>
                  )}
                  <p className="text-muted-foreground min-w-0 flex-1 truncate text-[13px]">
                    {it.bodySnippet}
                  </p>
                  {it.timeSpentMs ? (
                    <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                      {formatDuration(it.timeSpentMs)}
                    </span>
                  ) : null}
                  <ChevronRightIcon className="text-muted-foreground/40 size-3.5 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* 다음 행동 */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link
            to={setupAction}
            viewTransition
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
          >
            <PlayIcon className="size-3.5" /> 새 퀴즈 시작
          </Link>
          <Link
            to={hubHref}
            viewTransition
            className="border-border hover:border-primary hover:text-link inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
          >
            {subjectMeta.name} 허브로
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
