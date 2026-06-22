// 목표 요약 띠 + 설정 Sheet — /study/stats 상단(통폐합 3a, goals 폼 이관).
// 폼은 /study/stats action 으로 POST(useFetcher) → setNextExamPlan + upsertStudyGoals.
// 저장 후 shouldRevalidate(POST→재검증)로 띠·진도가 갱신된다.
import { CalendarIcon, SettingsIcon } from "lucide-react";
import { useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/core/components/ui/sheet";
import type { StudyGoals } from "~/features/goals/queries.server";
import { GoalFields } from "~/features/study/components/goal-fields";

export function GoalSummaryBar({
  goals,
  examRound,
}: {
  goals: StudyGoals;
  examRound: "first" | "second";
}) {
  const fetcher = useFetcher<{ ok?: true } | { error?: string }>();
  const submitting = fetcher.state !== "idle";
  const errorMsg =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const saved =
    fetcher.data && "ok" in fetcher.data && fetcher.data.ok ? true : false;

  const dday = goals.examDate
    ? Math.max(
        0,
        Math.ceil(
          (new Date(goals.examDate).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      )
    : null;
  const dailyHourTarget = (goals.weeklyGoalHours / 7).toFixed(1);

  return (
    <div
      className="border-border bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
      data-testid="goal-summary-bar"
    >
      <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        학습 목표
      </span>
      {dday !== null ? (
        <Badge variant="outline" className="gap-1 text-xs tabular-nums">
          <CalendarIcon className="size-3" /> D-{dday}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">시험일 미설정</span>
      )}
      {dday !== null && goals.weeklyGoalHours > 0 ? (
        <span className="text-muted-foreground text-xs tabular-nums">
          일평균 권장 {dailyHourTarget}h
        </span>
      ) : null}
      <Badge variant="outline" className="text-xs">
        {examRound === "second" ? "2차" : "1차"}
      </Badge>
      {goals.targetScore != null ? (
        <Badge variant="outline" className="text-xs tabular-nums">
          목표 {goals.targetScore}점
        </Badge>
      ) : null}

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="ml-auto">
            <SettingsIcon className="size-3.5" /> 목표 설정
          </Button>
        </SheetTrigger>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>학습 목표 설정</SheetTitle>
            <SheetDescription>
              시험일·차수·주간 목표를 설정하면 D-day 와 추천에 반영됩니다.
            </SheetDescription>
          </SheetHeader>
          <fetcher.Form
            method="post"
            action="/study/stats"
            className="space-y-4 px-4 pb-6"
          >
            <GoalFields goals={goals} examRound={examRound} />

            {errorMsg ? (
              <p
                className="text-sm text-rose-600 dark:text-rose-400"
                role="alert"
              >
                {errorMsg}
              </p>
            ) : null}
            {saved ? (
              <p
                className="text-sm text-emerald-600 dark:text-emerald-400"
                role="status"
                data-testid="goal-saved"
              >
                저장되었습니다.
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={submitting}
              data-testid="goal-save"
              className="w-full"
            >
              {submitting ? "저장 중…" : "저장"}
            </Button>
          </fetcher.Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
