// GS 문항 → 학습과목 주관식 문제은행 승격 — feat-10-001.
// 종료된 GS 회차의 gs_questions 를 problems(format=subjective, origin=mock) 로 일괄 승격한다.
// gs_question ↔ problem 은 problems.source_gs_question_id 로 1:1 역참조 (멱등성 키).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  getGsRound,
  listGsQuestions,
  type RubricCriterion,
} from "./queries.server";

type ProblemInsert = Database["public"]["Tables"]["problems"]["Insert"];

/**
 * 주어진 GS 문항들 중 이미 주관식 문제로 승격된 것을 찾는다.
 * @returns gs_question_id → problem_id 맵 (soft delete 제외)
 */
export async function getPromotedLinks(
  client: SupabaseClient<Database>,
  gsQuestionIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (gsQuestionIds.length === 0) return map;
  const { data, error } = await client
    .from("problems")
    .select("problem_id, source_gs_question_id")
    .in("source_gs_question_id", gsQuestionIds)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.source_gs_question_id) {
      map.set(row.source_gs_question_id, row.problem_id);
    }
  }
  return map;
}

export interface PromotionResult {
  ok: boolean;
  error?: string;
  promoted: number;
  skipped: number;
}

// 채점 criterion 배열 → 사람이 읽는 markdown. problems.grading_rubric_md 로 옮긴다.
// (구조화된 rubric_items 편집은 /admin/problems/:id 후속 — feat-10-001 §11)
function rubricToMarkdown(rubric: RubricCriterion[]): string | null {
  if (rubric.length === 0) return null;
  return rubric
    .map((c) => {
      const head = `- ${c.label} (${c.maxPoints}점)`;
      return c.descriptionMd ? `${head}\n  ${c.descriptionMd}` : head;
    })
    .join("\n");
}

/**
 * 종료된 GS 회차의 문항을 학습과목 주관식 문제로 일괄 승격한다.
 * 멱등 — 이미 승격된 문항(source_gs_question_id 연결)은 건너뛴다.
 * 권한(staff)·회차 존재는 호출부 action 에서, 회차 종료(closed) 는 여기서 검증한다.
 */
export async function promoteRoundToProblemBank(
  client: SupabaseClient<Database>,
  roundId: string,
  userId: string,
): Promise<PromotionResult> {
  const round = await getGsRound(client, roundId);
  if (!round) {
    return {
      ok: false,
      error: "회차를 찾을 수 없습니다.",
      promoted: 0,
      skipped: 0,
    };
  }
  if (round.status !== "closed") {
    return {
      ok: false,
      error: "회차를 종료(closed)한 뒤에만 문제은행에 등록할 수 있습니다.",
      promoted: 0,
      skipped: 0,
    };
  }

  const questions = await listGsQuestions(client, roundId);
  if (questions.length === 0) {
    return {
      ok: false,
      error: "등록할 문항이 없습니다.",
      promoted: 0,
      skipped: 0,
    };
  }

  const promoted = await getPromotedLinks(
    client,
    questions.map((q) => q.questionId),
  );
  const pending = questions
    .filter((q) => !promoted.has(q.questionId))
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (pending.length === 0) {
    return { ok: true, promoted: 0, skipped: questions.length };
  }

  // 과목 슬러그 → law_id (2차 4과목은 모두 seed 됨; 실패 시 null — law_id nullable).
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", round.subject)
    .maybeSingle();
  const lawId = law?.law_id ?? null;

  const startYear = new Date(round.startAt).getFullYear();
  const year = Number.isFinite(startYear) ? startYear : null;

  const rows: ProblemInsert[] = pending.map((q) => ({
    format: "subjective",
    origin: "mock",
    exam_round: "second",
    subject_type: "law",
    law_id: lawId,
    body_md: q.bodyMd,
    model_answer_md: q.modelAnswerMd,
    grading_rubric_md: rubricToMarkdown(q.rubric),
    subjective_topic: q.title,
    total_points: q.maxScore,
    year,
    exam_round_no: round.roundNumber,
    problem_number: q.orderIndex + 1,
    source_gs_question_id: q.questionId,
    created_by: userId,
  }));

  const { error } = await client.from("problems").insert(rows);
  if (error) {
    const message =
      error.code === "23505"
        ? "이미 등록된 문항이 있습니다. 새로고침 후 다시 시도하세요."
        : error.message;
    return { ok: false, error: message, promoted: 0, skipped: 0 };
  }

  return {
    ok: true,
    promoted: rows.length,
    skipped: questions.length - rows.length,
  };
}
