// 학생 논점 추출 훈련 — 색인 / attempt CRUD.
// 색인 게이트: gs_question_issues 에 review_status='approved' 가 1개 이상인 question 만 노출.
// 본인 attempt 만 R/W. staff 진척 모니터링은 §4 에서.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface IssueAttempt {
  attemptId: string;
  userId: string;
  gsQuestionId: string;
  studentIssuesMd: string;
  selfCheck: SelfCheck | null;
  aiAnalysis: AiAnalysis | null;
  submittedAt: string | null;
  selfCheckedAt: string | null;
  aiAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 자기채점 결과 — 학생이 모범 논점과 대조해 직접 체크. */
export interface SelfCheck {
  hits: string[];      // 짚은 모범 issueId
  missed: string[];    // 빠뜨린 모범 issueId
  wrong: string[];     // 잘못 넣은 자작 논점 텍스트
}

/** §3 — AI 분석 결과 자리. 본 § 에서는 구조만 정의. */
export interface AiAnalysis {
  hits: Array<{ issueId: string; evidence?: string }>;
  missed: Array<{ issueId: string; severity: "core" | "side" }>;
  extras: string[];
  reasoning?: string;
}

const COLUMNS =
  "attempt_id, user_id, gs_question_id, student_issues_md, self_check, ai_analysis, submitted_at, self_checked_at, ai_analyzed_at, created_at, updated_at";

type AttemptRow = Database["public"]["Tables"]["user_issue_attempts"]["Row"];

function rowToAttempt(r: AttemptRow): IssueAttempt {
  return {
    attemptId: r.attempt_id,
    userId: r.user_id,
    gsQuestionId: r.gs_question_id,
    studentIssuesMd: r.student_issues_md,
    selfCheck: (r.self_check as SelfCheck | null) ?? null,
    aiAnalysis: (r.ai_analysis as AiAnalysis | null) ?? null,
    submittedAt: r.submitted_at,
    selfCheckedAt: r.self_checked_at,
    aiAnalyzedAt: r.ai_analyzed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface IssueIndexItem {
  gsQuestionId: string;
  roundId: string;
  roundTitle: string;
  subject: LawSubjectSlug;
  questionTitle: string | null;
  bodyPreview: string;
  orderIndex: number;
  approvedIssueCount: number;
  myAttempt: {
    attemptId: string;
    submittedAt: string | null;
    selfCheckedAt: string | null;
  } | null;
}

/**
 * 학생 색인 — 승인된 논점 ≥1 인 문항만. round 가 'closed' 여도 노출(학습용).
 * filters: subject (선택).
 */
export async function listIssueQuestionsForStudent(
  client: SupabaseClient<Database>,
  userId: string,
  filters: { subject?: LawSubjectSlug } = {},
): Promise<IssueIndexItem[]> {
  // 승인된 논점 보유 question_id 집합.
  let issueQ = client
    .from("gs_question_issues")
    .select("gs_question_id")
    .eq("review_status", "approved")
    .is("deleted_at", null)
    .not("gs_question_id", "is", null);
  const { data: issueRows, error: issueErr } = await issueQ;
  if (issueErr) throw issueErr;
  const qIds = Array.from(
    new Set(
      (issueRows ?? [])
        .map((r) => r.gs_question_id)
        .filter((v): v is string => typeof v === "string"),
    ),
  );
  if (qIds.length === 0) return [];

  // 문항 + round join.
  let qSel = client
    .from("gs_questions")
    .select(
      "question_id, round_id, title, body_md, order_index, gs_rounds!inner(round_id, title, subject, status)",
    )
    .in("question_id", qIds);
  if (filters.subject) qSel = qSel.eq("gs_rounds.subject", filters.subject);
  const { data: qRows, error: qErr } = await qSel;
  if (qErr) throw qErr;

  // 학생 본인 attempt 1:N → map by gsQuestionId.
  const { data: attemptRows } = await client
    .from("user_issue_attempts")
    .select("gs_question_id, attempt_id, submitted_at, self_checked_at")
    .eq("user_id", userId)
    .in("gs_question_id", qIds)
    .is("deleted_at", null);
  const attemptByQ = new Map<
    string,
    {
      attemptId: string;
      submittedAt: string | null;
      selfCheckedAt: string | null;
    }
  >();
  for (const r of attemptRows ?? []) {
    attemptByQ.set(r.gs_question_id, {
      attemptId: r.attempt_id,
      submittedAt: r.submitted_at,
      selfCheckedAt: r.self_checked_at,
    });
  }

  // 문항당 approved issue 카운트.
  const countByQ = new Map<string, number>();
  for (const r of issueRows ?? []) {
    if (typeof r.gs_question_id !== "string") continue;
    countByQ.set(r.gs_question_id, (countByQ.get(r.gs_question_id) ?? 0) + 1);
  }

  type QRow = NonNullable<typeof qRows>[number];
  return ((qRows ?? []) as QRow[])
    .map<IssueIndexItem | null>((row) => {
      const round = row.gs_rounds;
      if (!round) return null;
      return {
        gsQuestionId: row.question_id,
        roundId: row.round_id,
        roundTitle: round.title,
        subject: round.subject as LawSubjectSlug,
        questionTitle: row.title,
        bodyPreview: (row.body_md ?? "").slice(0, 160),
        orderIndex: row.order_index,
        approvedIssueCount: countByQ.get(row.question_id) ?? 0,
        myAttempt: attemptByQ.get(row.question_id) ?? null,
      };
    })
    .filter((v): v is IssueIndexItem => v !== null)
    .sort((a, b) => {
      // 미응시 우선 → 진행 중 → 자기채점 완료. 그 다음 회차 제목.
      const aRank = a.myAttempt?.selfCheckedAt
        ? 2
        : a.myAttempt?.submittedAt
          ? 1
          : 0;
      const bRank = b.myAttempt?.selfCheckedAt
        ? 2
        : b.myAttempt?.submittedAt
          ? 1
          : 0;
      if (aRank !== bRank) return aRank - bRank;
      return a.roundTitle.localeCompare(b.roundTitle, "ko");
    });
}

/** 학생 응시 화면용 — gs_question + round + (선택) 본인 attempt. */
export async function getIssueQuestionForStudent(
  client: SupabaseClient<Database>,
  userId: string,
  gsQuestionId: string,
): Promise<{
  question: {
    questionId: string;
    roundId: string;
    title: string | null;
    bodyMd: string;
    orderIndex: number;
  };
  round: {
    roundId: string;
    title: string;
    subject: LawSubjectSlug;
  };
  myAttempt: IssueAttempt | null;
} | null> {
  // 승인된 논점 1개 이상 — 게이트 재검증.
  const { count: approvedCount } = await client
    .from("gs_question_issues")
    .select("issue_id", { count: "exact", head: true })
    .eq("gs_question_id", gsQuestionId)
    .eq("review_status", "approved")
    .is("deleted_at", null);
  if ((approvedCount ?? 0) === 0) return null;

  const { data: q } = await client
    .from("gs_questions")
    .select(
      "question_id, round_id, title, body_md, order_index, gs_rounds!inner(round_id, title, subject)",
    )
    .eq("question_id", gsQuestionId)
    .maybeSingle();
  if (!q || !q.gs_rounds) return null;

  const { data: attempt } = await client
    .from("user_issue_attempts")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("gs_question_id", gsQuestionId)
    .is("deleted_at", null)
    .maybeSingle();

  return {
    question: {
      questionId: q.question_id,
      roundId: q.round_id,
      title: q.title,
      bodyMd: q.body_md,
      orderIndex: q.order_index,
    },
    round: {
      roundId: q.gs_rounds.round_id,
      title: q.gs_rounds.title,
      subject: q.gs_rounds.subject as LawSubjectSlug,
    },
    myAttempt: attempt ? rowToAttempt(attempt as AttemptRow) : null,
  };
}

/**
 * upsert — autosave / submit / self_check 모두 같은 함수로.
 * (user_id, gs_question_id) unique 기반.
 */
export async function upsertIssueAttempt(
  client: SupabaseClient<Database>,
  args: {
    userId: string;
    gsQuestionId: string;
    studentIssuesMd?: string;
    submittedAt?: string | null;
    selfCheck?: SelfCheck | null;
    selfCheckedAt?: string | null;
  },
): Promise<IssueAttempt> {
  // 본인 attempt 존재 여부 확인 (서버에서 user_id 보장).
  const { data: existing } = await client
    .from("user_issue_attempts")
    .select("attempt_id")
    .eq("user_id", args.userId)
    .eq("gs_question_id", args.gsQuestionId)
    .maybeSingle();

  const patch: Record<string, unknown> = {};
  if (args.studentIssuesMd !== undefined)
    patch.student_issues_md = args.studentIssuesMd;
  if (args.submittedAt !== undefined) patch.submitted_at = args.submittedAt;
  if (args.selfCheck !== undefined)
    patch.self_check =
      args.selfCheck === null
        ? null
        : (args.selfCheck as unknown as Database["public"]["Tables"]["user_issue_attempts"]["Insert"]["self_check"]);
  if (args.selfCheckedAt !== undefined)
    patch.self_checked_at = args.selfCheckedAt;

  if (existing) {
    const { data, error } = await client
      .from("user_issue_attempts")
      .update(patch)
      .eq("attempt_id", existing.attempt_id)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return rowToAttempt(data as AttemptRow);
  }
  const { data, error } = await client
    .from("user_issue_attempts")
    .insert({
      user_id: args.userId,
      gs_question_id: args.gsQuestionId,
      student_issues_md: args.studentIssuesMd ?? "",
      submitted_at: args.submittedAt ?? null,
      self_check:
        args.selfCheck === undefined || args.selfCheck === null
          ? null
          : (args.selfCheck as unknown as Database["public"]["Tables"]["user_issue_attempts"]["Insert"]["self_check"]),
      self_checked_at: args.selfCheckedAt ?? null,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return rowToAttempt(data as AttemptRow);
}

/** 재도전 — student_issues_md 비우고 submitted/self_checked 초기화. ai_analysis 도 초기화. */
export async function resetIssueAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  gsQuestionId: string,
): Promise<void> {
  await client
    .from("user_issue_attempts")
    .update({
      student_issues_md: "",
      submitted_at: null,
      self_check: null,
      self_checked_at: null,
      ai_analysis: null,
      ai_analyzed_at: null,
    })
    .eq("user_id", userId)
    .eq("gs_question_id", gsQuestionId);
}
