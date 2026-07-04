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

// ─── 시험 일정 (exam_schedules — 운영자 관리 SSOT) ─────────────────────────
// 학생은 "2027년 1차"처럼 연도·차수만 고르고 시험일은 여기서 자동 파생된다.

export interface ExamPlanOption {
  /** `${examYear}:${examRound}` — 폼 select value. */
  value: string;
  label: string;
  examYear: number;
  examRound: "first" | "second";
  examDate: string; // YYYY-MM-DD
}

function planLabel(year: number, round: "first" | "second", date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${year}년 ${round === "first" ? "1차" : "2차"} (시험일 ${m}월 ${d}일)`;
}

/** 목표 폼 옵션 — 시험일이 지나지 않은 일정만, 시험일 오름차순. */
export async function listExamPlanOptions(
  client: SupabaseClient<Database>,
): Promise<ExamPlanOption[]> {
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await client
    .from("exam_schedules")
    .select("exam_year, exam_round, exam_date")
    .gte("exam_date", todayKst)
    .order("exam_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    value: `${r.exam_year}:${r.exam_round}`,
    label: planLabel(r.exam_year, r.exam_round as "first" | "second", r.exam_date),
    examYear: r.exam_year,
    examRound: r.exam_round as "first" | "second",
    examDate: r.exam_date,
  }));
}

export async function getExamScheduleDate(
  client: SupabaseClient<Database>,
  examYear: number,
  examRound: "first" | "second",
): Promise<string | null> {
  const { data, error } = await client
    .from("exam_schedules")
    .select("exam_date")
    .eq("exam_year", examYear)
    .eq("exam_round", examRound)
    .maybeSingle();
  if (error) throw error;
  return data?.exam_date ?? null;
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
