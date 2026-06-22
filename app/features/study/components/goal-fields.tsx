// 학습 목표 입력 필드 — /study/stats 요약 띠 + 대시보드 입력 허브 공용(드리프트 0).
// 폼(fetcher.Form action="/study/stats")은 호출처가 소유; 여기는 필드만.
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import type { StudyGoals } from "~/features/goals/queries.server";

export function GoalFields({
  goals,
  examRound,
}: {
  goals: StudyGoals;
  examRound: "first" | "second";
}) {
  return (
    <>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          시험일
        </Label>
        <Input
          type="date"
          name="examDate"
          defaultValue={goals.examDate ?? ""}
          data-testid="goal-exam-date"
          className="mt-1"
        />
      </div>
      <div>
        <Label className="text-muted-foreground text-xs tracking-wide uppercase">
          시험 차수
        </Label>
        <select
          name="examRound"
          defaultValue={examRound}
          className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
        >
          <option value="first">1차 (객관식)</option>
          <option value="second">2차 (주관식)</option>
        </select>
        <p className="text-muted-foreground mt-1 text-[11px]">
          선택한 차수에 맞춰 추천 문제 과목이 자동 반영됩니다.
        </p>
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
