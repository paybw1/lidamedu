// 퀴즈 세션 결과 화면 — 학습/시험 모드 공통.
// 정답률 + 소요시간 + 지문별 O/X + 오답만 다시 풀기 + 체계도 복귀.

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleXIcon,
  ClockIcon,
  FlagIcon,
  MinusCircleIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import { cn } from "~/core/lib/utils";
import makeServerClient from "~/core/lib/supa-client.server";
import { getQuizSessionResult } from "~/features/study/queries.server";
import {
  LAW_SUBJECTS,
  lawSubjectSlugSchema,
} from "~/features/subjects/lib/subjects";

import type { Route } from "./+types/quiz-result";

export const meta: Route.MetaFunction = ({ data: loaderData }) => {
  if (!loaderData) return [{ title: "퀴즈 결과 | Lidam Edu" }];
  return [{ title: `${loaderData.subject.name} 퀴즈 결과 | Lidam Edu` }];
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
    <div className="mx-auto w-full max-w-screen-lg px-5 py-6 md:px-10 md:py-8">
      <div className="mb-6 flex items-center gap-2">
        <Link
          to={`/subjects/${subject.slug}/problems/system`}
          viewTransition
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeftIcon className="size-4" /> 체계도 복귀
        </Link>
      </div>

      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
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
        <h1 className="text-2xl font-bold tracking-tight">퀴즈 결과</h1>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="정답률"
          value={`${accuracyPct}%`}
          hint={`정답 ${correctCount} / 응답 ${attemptedCount}`}
          tone="primary"
        />
        <KpiCard
          label="총 문항"
          value={`${total}`}
          hint={skipped > 0 ? `미응답 ${skipped}` : "전부 응답"}
        />
        <KpiCard label="오답" value={`${wrongCount}`} hint="틀린 문항" />
        <KpiCard
          label="소요 시간"
          value={totalTimeMs > 0 ? formatDuration(totalTimeMs) : "—"}
          hint="응답 합계"
          icon={<ClockIcon className="size-3.5" />}
        />
      </div>

      {wrongFirstHref ? (
        <Card className="mb-4 border-amber-300/60 bg-amber-50/50 dark:border-amber-700/40 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm">
              오답 <span className="font-semibold">{wrongCount}건</span> ·
              오답노트에 자동 등록되었습니다.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="h-8">
                <Link
                  to={`/study/wrong-note?subject=${subject.slug}`}
                  viewTransition
                >
                  오답노트 열기 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
              <Button asChild size="sm" className="h-8">
                <Link to={wrongFirstHref} viewTransition>
                  첫 오답부터 다시 <ArrowRightIcon className="size-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <p className="text-sm font-semibold">지문별 결과</p>
        </CardHeader>
        <CardContent className="space-y-1">
          {items.map((it, idx) => (
            <Link
              key={it.problemId}
              to={`/subjects/${subject.slug}/problems/${it.problemId}`}
              viewTransition
              data-testid="result-row"
              className="hover:bg-accent flex items-start gap-3 rounded-md px-2 py-2 text-sm"
            >
              <span className="text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums">
                {idx + 1}
              </span>
              <ResultIcon isCorrect={it.isCorrect} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {it.year ? (
                    <Badge variant="outline" className="text-xs">
                      {it.year}년
                      {it.problemNumber ? ` · ${it.problemNumber}번` : ""}
                    </Badge>
                  ) : null}
                  {it.primaryArticleLabel ? (
                    <Badge variant="outline" className="text-xs">
                      {it.primaryArticleLabel}
                    </Badge>
                  ) : null}
                  {it.timeSpentMs ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatDuration(it.timeSpentMs)}
                    </span>
                  ) : null}
                  {it.selectedChoiceIndex ? (
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        it.isCorrect
                          ? "text-emerald-600"
                          : it.isCorrect === false
                            ? "text-rose-600"
                            : "text-muted-foreground",
                      )}
                    >
                      선택 {it.selectedChoiceIndex}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-0.5 truncate">
                  {it.bodySnippet}
                </p>
              </div>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ResultIcon({ isCorrect }: { isCorrect: boolean | null }) {
  if (isCorrect === true)
    return <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600" />;
  if (isCorrect === false)
    return <CircleXIcon className="size-5 shrink-0 text-rose-600" />;
  return <MinusCircleIcon className="text-muted-foreground size-5 shrink-0" />;
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "primary";
  icon?: React.ReactNode;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <p className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium tracking-wide uppercase">
          {icon}
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-bold tracking-tight tabular-nums",
            tone === "primary" && "text-primary",
          )}
        >
          {value}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{hint}</p>
      </CardContent>
    </Card>
  );
}
