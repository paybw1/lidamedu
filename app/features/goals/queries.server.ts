import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

export type ExamType = "first" | "second";

export interface StudyGoals {
  examDate: string | null; // YYYY-MM-DD
  weeklyGoalHours: number;
  examType: ExamType;
  targetScore: number | null;
  notes: string | null;
  updatedAt: string | null;
}

export const DEFAULT_STUDY_GOALS: StudyGoals = {
  examDate: null,
  weeklyGoalHours: 25,
  examType: "first",
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
    .select(
      "exam_date, weekly_goal_hours, exam_type, target_score, notes, updated_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_STUDY_GOALS;
  return {
    examDate: data.exam_date,
    weeklyGoalHours: data.weekly_goal_hours,
    examType: data.exam_type as ExamType,
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
    examType: ExamType;
    targetScore: number | null;
    notes: string | null;
  },
): Promise<void> {
  const { error } = await client.from("study_goals").upsert({
    user_id: userId,
    exam_date: input.examDate,
    weekly_goal_hours: input.weeklyGoalHours,
    exam_type: input.examType,
    target_score: input.targetScore,
    notes: input.notes,
  });
  if (error) throw error;
}
