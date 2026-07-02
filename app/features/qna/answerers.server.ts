// Q&A 답변자 지정 — 라우팅 리졸버 + 배정 조회/저장.
// 라우팅: 새 질문(스레드) → 답변자 카테고리 도출 → 담당자에게 알림 fanout.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { QnaTargetType } from "./labels";
import {
  isQnaAnswererCategory,
  type QnaAnswererCategory,
} from "./answerers";

// 법 과목 카테고리 — thread.subject(law_code) 가 이 집합이면 그대로 카테고리.
const LAW_CATEGORIES = new Set<string>([
  "patent",
  "trademark",
  "design",
  "civil",
  "civil-procedure",
]);

/**
 * 스레드 → 답변자 카테고리 도출.
 *  - 공부방법(study_method) → "study_method" (과목 무관, 단일 창구)
 *  - 과학 문제 → problems.science_subject (물리/화학/생물/지구과학)
 *  - 법 과목(조문·판례·문제·쟁점) → subject(law_code)
 *  - 공통/미해결 → null (담당자 없음 → 전체 staff 풀 fallback)
 */
export async function resolveAnswererCategory(
  client: SupabaseClient<Database>,
  thread: {
    targetType: QnaTargetType;
    targetId: string | null;
    subject: string | null;
  },
): Promise<QnaAnswererCategory | null> {
  if (thread.targetType === "study_method") return "study_method";

  // 과학 문제는 분과(science_subject)로 세분 라우팅.
  if (thread.targetType === "problem" && thread.targetId) {
    const { data } = await client
      .from("problems")
      .select("science_subject")
      .eq("problem_id", thread.targetId)
      .maybeSingle();
    const sci = data?.science_subject;
    if (sci && isQnaAnswererCategory(sci)) return sci;
  }

  if (thread.subject && LAW_CATEGORIES.has(thread.subject)) {
    return thread.subject as QnaAnswererCategory;
  }
  return null;
}

/** 카테고리 담당자 profile_id 목록 — 알림 라우팅용. */
export async function getAnswererIdsForCategory(
  client: SupabaseClient<Database>,
  category: QnaAnswererCategory,
): Promise<string[]> {
  const { data, error } = await client
    .from("qna_answerer_assignments")
    .select("answerer_id")
    .eq("category", category);
  if (error || !data) return [];
  return data.map((r) => r.answerer_id);
}

export interface AnswererStaff {
  answererId: string;
  name: string | null;
}

export interface StaffOption {
  profileId: string;
  name: string | null;
  role: string;
}

// 답변자 후보(강사·매니저·원장) 목록 — 지정 화면 피커용.
// ★ profiles RLS 는 staff 에게도 본인만 허용 → 타 사용자 조회는 adminClient 필수.
export async function listStaffForAssignment(
  adminClient: SupabaseClient<Database>,
): Promise<StaffOption[]> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, role")
    .in("role", ["instructor", "manager", "admin"])
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    profileId: r.profile_id,
    name: r.name,
    role: r.role,
  }));
}

/** 카테고리별 담당자 목록(이름 포함) — 운영관리 화면·배지용. */
export async function listAnswererAssignments(
  client: SupabaseClient<Database>,
): Promise<Record<string, AnswererStaff[]>> {
  // profiles FK 가 2개(answerer_id·created_by)라 임베드 컬럼 힌트 필수.
  const { data, error } = await client
    .from("qna_answerer_assignments")
    .select(
      "category, answerer_id, answerer:profiles!qna_answerer_assignments_answerer_id_fkey ( name )",
    );
  if (error || !data) return {};
  const out: Record<string, AnswererStaff[]> = {};
  for (const row of data) {
    (out[row.category] ??= []).push({
      answererId: row.answerer_id,
      name: row.answerer?.name ?? null,
    });
  }
  return out;
}

/**
 * 한 카테고리의 담당자 집합을 통째로 교체(요청 client — RLS manager 쓰기 강제).
 *  기존 배정 중 새 목록에 없는 건 삭제, 새로 추가된 건 insert.
 */
export async function setCategoryAnswerers(
  client: SupabaseClient<Database>,
  category: QnaAnswererCategory,
  answererIds: string[],
  byUserId: string,
): Promise<void> {
  const target = [...new Set(answererIds)];

  const { data: existing } = await client
    .from("qna_answerer_assignments")
    .select("answerer_id")
    .eq("category", category);
  const current = new Set((existing ?? []).map((r) => r.answerer_id));

  const toAdd = target.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !target.includes(id));

  if (toRemove.length > 0) {
    const { error } = await client
      .from("qna_answerer_assignments")
      .delete()
      .eq("category", category)
      .in("answerer_id", toRemove);
    if (error) throw error;
  }
  if (toAdd.length > 0) {
    const { error } = await client.from("qna_answerer_assignments").insert(
      toAdd.map((id) => ({
        category,
        answerer_id: id,
        created_by: byUserId,
      })),
    );
    if (error) throw error;
  }
}
