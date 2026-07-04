// 학습 목표 입력 필드 — /study/stats 요약 띠 + 대시보드 입력 허브 공용(드리프트 0).
// 폼(fetcher.Form action="/study/stats")은 호출처가 소유; 여기는 필드만.
// 시험일·차수는 "응시 시험" 하나로 통합 — 운영자가 등록한 시험 일정(exam_schedules)에서
// 연도·차수를 고르면 시험일이 자동 설정된다.
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import type {
  ExamPlanOption,
  StudyGoals,
} from "~/features/goals/queries.server";

export function GoalFields({
  goals,
  examRound,
  examOptions,
  selectedPlan,
}: {
  goals: StudyGoals;
  examRound: "first" | "second";
  examOptions: ExamPlanOption[];
  selectedPlan: string | null;
}) {
  return (
    <>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          응시 시험
        </Label>
        <select
          name="examPlan"
          defaultValue={selectedPlan ?? ""}
          data-testid="goal-exam-plan"
          className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="">선택 안 함</option>
          {examOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground mt-1 text-[11px]">
          선택하면 시험일(D-day)이 자동 설정되고, 차수에 맞춰 추천 문제 과목이
          반영됩니다.
          {goals.examDate ? ` 현재 시험일: ${goals.examDate}` : ""}
        </p>
        {/* 기존 차수 유지용 — 응시 시험을 고르지 않은 경우 차수 하위호환 */}
        <input type="hidden" name="examRound" value={examRound} />
      </div>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          주간 목표 시간 (시간)
        </Label>
        <Input
          type="number"
          name="weeklyGoalHours"
          min={0}
          max={168}
          step={1}
          defaultValue={String(goals.weeklyGoalHours)}
          required
          data-testid="goal-weekly-hours"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          목표 점수 (선택)
        </Label>
        <Input
          type="number"
          name="targetScore"
          min={0}
          max={1000}
          step={1}
          defaultValue={goals.targetScore?.toString() ?? ""}
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          메모 (선택)
        </Label>
        <textarea
          name="notes"
          defaultValue={goals.notes ?? ""}
          rows={3}
          maxLength={500}
          className="border-input bg-background mt-1 min-h-[72px] w-full rounded-md border p-2 text-sm"
        />
      </div>
    </>
  );
}
