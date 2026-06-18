import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

// 시험 차수(1차/2차)는 profiles.next_exam_round 로 일원화(feat-2-025) —
// study_goals.exam_type 는 제거됨. 차수 읽기/쓰기는 exam-results/queries.server 의
// getNextExamPlan/setNextExamPlan 을 사용한다.
export interface StudyGoals {
  examDate: string | null; // YYYY-MM-DD
  weeklyGoalHours: number;
  targetScore: number | null;
  notes: string | null;
  updatedAt: string | null;
}

export const DEFAULT_STUDY_GOALS: StudyGoals = {
  examDate: null,
  weeklyGoalHours: 25,
  targetScore: null,
  notes: null,
  updatedAt: null,
};

export async function getStudyGoals(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StudyGoals> {
  const { data, error } = await client
    .from("study_goals")
    .select("exam_date, weekly_goal_hours, target_score, notes, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_STUDY_GOALS;
  return {
    examDate: data.exam_date,
    weeklyGoalHours: data.weekly_goal_hours,
    targetScore: data.target_score,
    notes: data.notes,
    updatedAt: data.updated_at,
  };
}

export async function upsertStudyGoals(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    examDate: string | null;
    weeklyGoalHours: number;
    targetScore: number | null;
    notes: string | null;
  },
): Promise<void> {
  const { error } = await client.from("study_goals").upsert({
    user_id: userId,
    exam_date: input.examDate,
    weekly_goal_hours: input.weeklyGoalHours,
    target_score: input.targetScore,
    notes: input.notes,
  });
  if (error) throw error;
}
