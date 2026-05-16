// 퀴즈 세션 결과 화면 — 학습/시험 모드 공통.
// 정답률 + 소요시간 + 지문별 O/X + 오답만 다시 풀기 + 체계도 복귀.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleXIcon,
  ClockIcon,
  FlagIcon,
  MinusCircleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getQuizSessionResult } from "~/features/study/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/quiz-result";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "퀴즈 결과 | Lidam Patent Attorney Academy" }];
  return [{ title: `${loaderData.subject.name} 퀴즈 결과 | Lidam Patent Attorney Academy` }];
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const subjectParse = lawSubjectSlugSchema.safeParse(params.subject);
  if (!subjectParse.success) throw data("Unknown subject", { status: 404 });
  if (!params.sessionId) throw data("Missing session id", { status: 404 });

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const result = await getQuizSessionResult(client, user.id, params.sessionId);
  if (!result) throw data("Session not found", { status: 404 });

  return {
    subject: LAW_SUBJECTS[subjectParse.data],
    result,
  };
}

function formatDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  return `${m}분 ${s}초`;
}

export default function QuizResult({ loaderData }: Route.ComponentProps) {
  const { subject, result } = loaderData;
  const { session, items, attemptedCount, correctCount, totalTimeMs } = result;
  const total = items.length;
  const wrongCount = attemptedCount - correctCount;
  const skipped = total - attemptedCount;
  const accuracyPct =
    attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const wrongItems = items.filter((it) => it.isCorrect === false);

  // 첫 오답으로 다시 풀러 가는 링크 (학습 모드 세션 새로 시작).
  const wrongFirstHref = wrongItems[0]
    ? `/subjects/${subject.slug}/problems/${wrongItems[0].problemId}`
    : null;

  const nodeId =
    typeof session.scopePayload.nodeId === "string"
      ? session.scopePayload.nodeId
      : null;

  return (
    <div className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-[720px] px-6 py-8 pb-20">
        {/* Back link */}
        <div className="mb-4">
          <Link
            to={`/subjects/${subject.slug}/problems/system`}
            viewTransition
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            체계도 복귀
          </Link>
        </div>

        {/* Header */}
        <header className="mb-6">
          <p className="mb-2 font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-primary">
            QUIZ RESULT
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{subject.name}</Badge>
            <Badge variant={session.mode === "exam" ? "destructive" : "default"}>
              {session.mode === "exam" ? "시험 모드" : "학습 모드"}
            </Badge>
            {nodeId && typeof session.scopePayload.nodeLabel === "string" ? (
              <Badge variant="outline">{session.scopePayload.nodeLabel}</Badge>
            ) : null}
            {session.completedAt ? (
              <Badge variant="outline" className="ml-auto">
                <FlagIcon className="size-3" />
                완료
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto">
                진행 중 (저장됨)
              </Badge>
            )}
          </div>
          <h1 className="text-[28px] font-extrabold tracking-tight text-foreground leading-tight">
            퀴즈 결과
          </h1>
        </header>

        {/* KPI 4 cards */}
        <div className="mb-4 grid grid-cols-4 gap-3 sm:gap-3">
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
          <KpiCard
            label="오답"
            value={`${wrongCount}`}
            hint="틀린 문항"
            tone="coral"
          />
          <KpiCard
            label="소요"
            value={totalTimeMs > 0 ? formatDuration(totalTimeMs) : "—"}
            hint="응답 합계"
            icon={<ClockIcon className="size-3 shrink-0" />}
          />
        </div>

        {/* Wrong-note banner */}
        {wrongFirstHref ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-amber-50/80 px-[18px] py-3.5 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40">
            <TriangleAlertIcon className="size-[18px] shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="flex-1 text-[14px] font-medium leading-[1.4] text-foreground">
              오답 <span className="font-semibold">{wrongCount}건</span>이 오답노트에 저장됐어요
            </p>
            <div className="flex shrink-0 gap-2">
              <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3.5 text-[12px] font-semibold">
                <Link to={`/study/wrong-note?subject=${subject.slug}`} viewTransition>
                  오답노트로
                  <ArrowRightIcon className="size-3 shrink-0" />
                </Link>
              </Button>
              <Button asChild size="sm" className="h-8 rounded-full px-3.5 text-[12px] font-semibold">
                <Link to={wrongFirstHref} viewTransition>
                  첫 오답부터
                  <ArrowRightIcon className="size-3 shrink-0" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}

        {/* Per-question result list */}
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b border-border px-[18px] py-3.5">
            <p className="font-mono text-[11px] font-bold tracking-[0.10em] uppercase text-muted-foreground">
              문항별 결과
            </p>
          </div>
          <ul className="divide-y divide-border/60">
            {items.map((it, idx) => (
              <li key={it.problemId}>
                <Link
                  to={`/subjects/${subject.slug}/problems/${it.problemId}`}
                  viewTransition
                  data-testid="result-row"
                  className="flex items-center gap-3 px-[18px] py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  {/* Result icon */}
                  <ResultIcon isCorrect={it.isCorrect} />

                  {/* Year / number chip */}
                  {it.year ? (
                    <span className="shrink-0 inline-flex h-[22px] items-center rounded-full bg-primary/10 px-2 font-mono text-[11px] font-semibold text-primary tabular-nums">
                      {it.year}
                      {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex h-[22px] items-center rounded-full bg-muted px-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                      {idx + 1}
                    </span>
                  )}

                  {/* Body snippet */}
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {it.bodySnippet}
                  </p>

                  {/* Article label */}
                  {it.primaryArticleLabel ? (
                    <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
                      {it.primaryArticleLabel}
                    </span>
                  ) : null}

                  {/* Time spent */}
                  {it.timeSpentMs ? (
                    <span className="shrink-0 font-mono text-[12px] text-muted-foreground tabular-nums">
                      {formatDuration(it.timeSpentMs)}
                    </span>
                  ) : null}

                  <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/40" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true)
    return (
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
        <CheckCircle2Icon className="size-3.5" />
      </span>
    );
  if (isCorrect === false)
    return (
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400">
        <CircleXIcon className="size-3.5" />
      </span>
    );
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
  tone?: "coral";
  highlight?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight
          ? "bg-primary/10 border-primary/20 dark:bg-primary/15 dark:border-primary/30"
          : "bg-muted/40 border-border/60",
      )}
    >
      <p className="mb-1.5 flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "text-[26px] font-extrabold leading-none tracking-tight tabular-nums",
          tone === "coral"
            ? "text-rose-600 dark:text-rose-400"
            : highlight
              ? "text-primary"
              : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
