import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import type {
  AnnotationTargetType,
} from "~/features/annotations/queries.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";
import { articleSlug } from "~/features/laws/lib/identifier";

export interface StudyScope {
  subject: LawSubjectSlug;
  target_type: AnnotationTargetType;
  target_id: string;
  tab?: string;
}

export async function recordStudySession(
  client: SupabaseClient<Database>,
  userId: string,
  scope: StudyScope,
): Promise<void> {
  const { error } = await client.from("study_sessions").insert({
    user_id: userId,
    scope: scope as unknown as Database["public"]["Tables"]["study_sessions"]["Insert"]["scope"],
  });
  if (error) throw error;
}

export interface SubjectProgress {
  visitedArticleIds: Set<string>;
  totalArticleCount: number;
  pctViewed: number;
  lastVisited: {
    articleId: string;
    articleNumber: string | null;
    displayLabel: string;
    visitedAt: string;
  } | null;
}

export async function getSubjectProgress(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
  totalArticleCount: number,
): Promise<SubjectProgress> {
  // 본인이 본 article 단위 study_sessions
  const { data, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const visited = new Set<string>();
  let last: SubjectProgress["lastVisited"] = null;
  for (const row of data ?? []) {
    const scope = row.scope as Partial<StudyScope> | null;
    if (!scope || scope.subject !== lawCode) continue;
    if (scope.target_type !== "article" || !scope.target_id) continue;
    visited.add(scope.target_id);
    if (!last) {
      last = {
        articleId: scope.target_id,
        articleNumber: null,
        displayLabel: "",
        visitedAt: row.started_at,
      };
    }
  }

  // last visited 의 displayLabel 채우기
  if (last) {
    const { data: a } = await client
      .from("articles")
      .select("article_number, display_label")
      .eq("article_id", last.articleId)
      .maybeSingle();
    if (a) {
      last.articleNumber = a.article_number;
      last.displayLabel = a.display_label;
    }
  }

  const pct =
    totalArticleCount > 0
      ? Math.round((visited.size / totalArticleCount) * 100)
      : 0;

  return {
    visitedArticleIds: visited,
    totalArticleCount,
    pctViewed: pct,
    lastVisited: last,
  };
}

// 문제 시도 기록.
// OX 자동 채점: selectedChoiceId(또는 selectedBoxItemId) + oxAnswer ('O'|'X') 가 함께 오면 OX 시도로 기록.
// 일반 객관식: selectedChoiceId + selectedChoiceIndex 만 오고 oxAnswer 는 null.
export async function recordProblemAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    problemId: string;
    selectedChoiceId: string | null;
    selectedChoiceIndex: number | null;
    selectedBoxItemId?: string | null;
    oxAnswer?: "O" | "X" | null;
    isCorrect: boolean;
    mode?: "study" | "exam";
    timeSpentMs?: number | null;
    sessionId?: string | null;
  },
): Promise<void> {
  const { error } = await client.from("user_problem_attempts").insert({
    user_id: userId,
    problem_id: input.problemId,
    selected_choice_id: input.selectedChoiceId,
    selected_choice_index: input.selectedChoiceIndex,
    selected_box_item_id: input.selectedBoxItemId ?? null,
    ox_answer: input.oxAnswer ?? null,
    is_correct: input.isCorrect,
    mode: input.mode ?? "study",
    time_spent_ms: input.timeSpentMs ?? null,
    session_id: input.sessionId ?? null,
  });
  if (error) throw error;
}

// ---- 퀴즈 세션 ----

export type QuizMode = "study" | "exam";
export type QuizScopeType =
  | "node"
  | "filter"
  | "wrong-note"
  | "bookmark"
  | "free"
  | "pack";

export interface QuizSession {
  sessionId: string;
  mode: QuizMode;
  lawCode: LawSubjectSlug | null;
  scienceSubject:
    | "physics"
    | "chemistry"
    | "biology"
    | "earth_science"
    | null;
  scopeType: QuizScopeType;
  scopePayload: Record<string, unknown>;
  problemIds: string[];
  timeLimitSec: number | null;
  startedAt: string;
  completedAt: string | null;
  /** feat-10-005 — 통합 시험 교시 세션이면 그 응시(mcq_exam_attempts) id. */
  examAttemptId: string | null;
}

export async function createQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  input: {
    mode: QuizMode;
    // 둘 중 정확히 하나 (DB check 가 강제) — 법률 vs 자연과학.
    lawCode?: LawSubjectSlug;
    scienceSubject?: "physics" | "chemistry" | "biology" | "earth_science";
    scopeType: QuizScopeType;
    scopePayload?: Record<string, unknown>;
    problemIds: string[];
    timeLimitSec?: number | null;
    // MCQ 팩 응시 시 — 응시 결과를 pack 단위 통계와 묶기 위함.
    packId?: string | null;
    // feat-10-005 — 통합 시험 교시 세션이면 그 응시(mcq_exam_attempts).
    examAttemptId?: string | null;
  },
): Promise<string> {
  if (!!input.lawCode === !!input.scienceSubject) {
    throw new Error("createQuizSession: lawCode XOR scienceSubject");
  }
  const { data, error } = await client
    .from("quiz_sessions")
    .insert({
      user_id: userId,
      mode: input.mode,
      law_code: input.lawCode ?? null,
      science_subject: input.scienceSubject ?? null,
      scope_type: input.scopeType,
      scope_payload: (input.scopePayload ?? {}) as Database["public"]["Tables"]["quiz_sessions"]["Insert"]["scope_payload"],
      problem_ids: input.problemIds,
      time_limit_sec: input.timeLimitSec ?? null,
      pack_id: input.packId ?? null,
      exam_attempt_id: input.examAttemptId ?? null,
    })
    .select("session_id")
    .single();
  if (error) throw error;
  return data.session_id;
}

export async function completeQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await client
    .from("quiz_sessions")
    .update({ completed_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .is("completed_at", null);
  if (error) throw error;
}

export async function getQuizSession(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<QuizSession | null> {
  const { data, error } = await client
    .from("quiz_sessions")
    .select(
      "session_id, mode, law_code, science_subject, scope_type, scope_payload, problem_ids, time_limit_sec, started_at, completed_at, exam_attempt_id",
    )
    .eq("session_id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    sessionId: data.session_id,
    mode: data.mode as QuizMode,
    lawCode: data.law_code as LawSubjectSlug | null,
    scienceSubject:
      data.science_subject as QuizSession["scienceSubject"],
    scopeType: data.scope_type as QuizScopeType,
    scopePayload: (data.scope_payload as Record<string, unknown>) ?? {},
    problemIds: data.problem_ids,
    timeLimitSec: data.time_limit_sec,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    examAttemptId: data.exam_attempt_id,
  };
}

// 재학습 진입점 위젯용 — 오답 / 즐겨찾기 / 메모 카운트.
// 학생은 한 학기 누적이라도 수천 건 단위 — 정확 count(*) HEAD 요청으로 가볍게.
export interface StudyAidCounts {
  wrongMcq: number; // 최근 시도가 오답인 객관식 문제
  wrongOx: number; // 최근 시도가 오답인 OX 지문
  bookmarks: number;
  memos: number;
  highlights: number;
  comments: number;
}

export async function getStudyAidCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<StudyAidCounts> {
  const [wrongs, oxWrongs, bookmarkRes, memoRes, highlightRes, commentRes] =
    await Promise.all([
    // 객관식 오답 카운트 — 최근 시도 기준 정확 카운트는 expensive 라서
    // 정확한 listWrongAttempts 를 한 번 돌려 길이를 본다 (실제 위젯 표시용).
    listWrongAttempts(client, userId),
    listOxWrongAttempts(client, userId),
    client
      .from("user_bookmarks")
      .select("bookmark_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gt("star_level", 0),
    client
      .from("user_memos")
      .select("memo_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null),
    client
      .from("user_highlights")
      .select("highlight_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null),
    client
      .from("content_comments")
      .select("comment_id", { count: "exact", head: true })
      .eq("author_id", userId)
      .is("deleted_at", null),
  ]);
  return {
    wrongMcq: wrongs.length,
    wrongOx: oxWrongs.length,
    bookmarks: bookmarkRes.count ?? 0,
    memos: memoRes.count ?? 0,
    highlights: highlightRes.count ?? 0,
    comments: commentRes.count ?? 0,
  };
}

// ──────── 주관식 답안 + 자기채점 + 첨삭 (feat-4-A-305 + feat-3-402) ────────
export interface SubjectiveAttempt {
  attemptId: string;
  answerMd: string;
  selfScore: number | null;
  selfScoreNote: string | null;
  submittedAt: string | null;
  updatedAt: string;
  // 첨삭(강사 검토) 상태.
  reviewRequestedAt: string | null;
  reviewCompletedAt: string | null;
  reviewerId: string | null;
  reviewerScore: number | null;
  reviewerCommentMd: string | null;
  // 채점기준 체크리스트 체크된 항목 인덱스 (feat-4-A-322).
  rubricSelfCheck: number[] | null;
}

const ATTEMPT_COLUMNS =
  "attempt_id, user_id, problem_id, answer_md, self_score, self_score_note, submitted_at, updated_at, review_requested_at, review_completed_at, reviewer_id, reviewer_score, reviewer_comment_md, rubric_self_check";

function rowToAttempt(row: {
  attempt_id: string;
  answer_md: string;
  self_score: number | null;
  self_score_note: string | null;
  submitted_at: string | null;
  updated_at: string;
  review_requested_at: string | null;
  review_completed_at: string | null;
  reviewer_id: string | null;
  reviewer_score: number | null;
  reviewer_comment_md: string | null;
  rubric_self_check: unknown;
}): SubjectiveAttempt {
  return {
    attemptId: row.attempt_id,
    answerMd: row.answer_md,
    selfScore: row.self_score,
    selfScoreNote: row.self_score_note,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    reviewRequestedAt: row.review_requested_at,
    reviewCompletedAt: row.review_completed_at,
    reviewerId: row.reviewer_id,
    reviewerScore: row.reviewer_score,
    reviewerCommentMd: row.reviewer_comment_md,
    rubricSelfCheck: Array.isArray(row.rubric_self_check)
      ? (row.rubric_self_check as unknown[]).filter(
          (v): v is number => typeof v === "number",
        )
      : null,
  };
}

export async function getSubjectiveAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
): Promise<SubjectiveAttempt | null> {
  const { data, error } = await client
    .from("user_subjective_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("user_id", userId)
    .eq("problem_id", problemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowToAttempt(data);
}

// 첨삭 요청 — 학생 본인. submitted_at 이 NULL 이면 제출되지 않은 답안이라 거부.
export async function requestSubjectiveReview(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
): Promise<{ ok: true; attempt: SubjectiveAttempt } | { ok: false; error: string }> {
  const existing = await getSubjectiveAttempt(client, userId, problemId);
  if (!existing) return { ok: false, error: "답안이 없습니다" };
  if (!existing.submittedAt) {
    return { ok: false, error: "자기채점 완료(제출) 후에 첨삭 요청이 가능합니다." };
  }
  if (existing.reviewRequestedAt && !existing.reviewCompletedAt) {
    return { ok: false, error: "이미 첨삭 요청 중입니다." };
  }
  const { data, error } = await client
    .from("user_subjective_attempts")
    .update({
      review_requested_at: new Date().toISOString(),
      review_completed_at: null,
      reviewer_id: null,
      reviewer_score: null,
      reviewer_comment_md: null,
    })
    .eq("attempt_id", existing.attemptId)
    .eq("user_id", userId)
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, attempt: rowToAttempt(data) };
}

// 강사 검토 완료. staff role 검사는 caller (action) 에서.
export async function completeSubjectiveReview(
  client: SupabaseClient<Database>,
  reviewerId: string,
  attemptId: string,
  input: { score: number | null; commentMd: string | null },
): Promise<{ ok: true; attempt: SubjectiveAttempt } | { ok: false; error: string }> {
  const { data, error } = await client
    .from("user_subjective_attempts")
    .update({
      reviewer_id: reviewerId,
      reviewer_score: input.score,
      reviewer_comment_md: input.commentMd,
      review_completed_at: new Date().toISOString(),
    })
    .eq("attempt_id", attemptId)
    .not("review_requested_at", "is", null)
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, attempt: rowToAttempt(data) };
}

// 강사 큐 — 검토 요청 대기 중. admin client 로 RLS 우회 (RLS staff_select 가 있어도 명시적 사용).
export interface PendingReviewItem {
  attemptId: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  problemId: string;
  problemYear: number | null;
  problemNumber: number | null;
  problemBodySnippet: string;
  lawCode: string | null;
  selfScore: number | null;
  submittedAt: string | null;
  requestedAt: string;
  answerMd: string;
}

export async function listPendingSubjectiveReviews(
  client: SupabaseClient<Database>,
  options: { onlyCompleted?: boolean; limit?: number } = {},
): Promise<PendingReviewItem[]> {
  const limit = options.limit ?? 100;
  let q = client
    .from("user_subjective_attempts")
    .select(
      "attempt_id, user_id, answer_md, self_score, submitted_at, review_requested_at, review_completed_at, problem_id, problems!inner(year, problem_number, body_md, laws(law_code)), profiles!user_id(name)",
    )
    .is("deleted_at", null)
    .not("review_requested_at", "is", null)
    .order("review_requested_at", { ascending: false })
    .limit(limit);
  if (options.onlyCompleted) {
    q = q.not("review_completed_at", "is", null);
  } else {
    q = q.is("review_completed_at", null);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => {
    const body = r.problems?.body_md ?? "";
    return {
      attemptId: r.attempt_id,
      userId: r.user_id,
      userName: r.profiles?.name ?? "",
      userEmail: null,
      problemId: r.problem_id,
      problemYear: r.problems?.year ?? null,
      problemNumber: r.problems?.problem_number ?? null,
      problemBodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      lawCode: r.problems?.laws?.law_code ?? null,
      selfScore: r.self_score,
      submittedAt: r.submitted_at,
      requestedAt: r.review_requested_at as string,
      answerMd: r.answer_md,
    };
  });
}

export async function upsertSubjectiveAttempt(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  input: {
    answerMd: string;
    // submit=true 시 self_score / submitted_at 동시 갱신.
    submit?: { selfScore: number | null; selfScoreNote: string | null };
    // rubric 체크리스트 — 항상 갱신 가능 (자기채점 진행 중에도).
    rubricSelfCheck?: number[] | null;
  },
): Promise<SubjectiveAttempt> {
  const row: Database["public"]["Tables"]["user_subjective_attempts"]["Insert"] = {
    user_id: userId,
    problem_id: problemId,
    answer_md: input.answerMd,
    ...(input.submit
      ? {
          self_score: input.submit.selfScore,
          self_score_note: input.submit.selfScoreNote,
          submitted_at: new Date().toISOString(),
        }
      : {}),
    ...(input.rubricSelfCheck !== undefined
      ? { rubric_self_check: input.rubricSelfCheck }
      : {}),
  };
  const { data, error } = await client
    .from("user_subjective_attempts")
    .upsert(row, {
      onConflict: "user_id,problem_id",
    })
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw error;
  return rowToAttempt(data);
}

// 한 세션 안에서 사용자가 이미 응답한 attempts — problemId → 최신 응답 1건 매핑.
// 시험지(sheet) view 가 새로고침되어도 이전 응답을 복원하기 위해 사용.
export interface SessionAttemptEntry {
  selectedChoiceId: string | null;
  selectedChoiceIndex: number | null;
  isCorrect: boolean;
  timeSpentMs: number | null;
  attemptedAt: string;
}

export async function getSessionAttemptsMap(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<Map<string, SessionAttemptEntry>> {
  const map = new Map<string, SessionAttemptEntry>();
  const { data, error } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, selected_choice_index, is_correct, time_spent_ms, attempted_at",
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("attempted_at", { ascending: false });
  if (error) throw error;
  for (const r of data ?? []) {
    if (map.has(r.problem_id)) continue;
    map.set(r.problem_id, {
      selectedChoiceId: r.selected_choice_id,
      selectedChoiceIndex: r.selected_choice_index,
      isCorrect: r.is_correct,
      timeSpentMs: r.time_spent_ms,
      attemptedAt: r.attempted_at,
    });
  }
  return map;
}

export interface QuizSessionResultItem {
  problemId: string;
  problemNumber: number | null;
  year: number | null;
  bodySnippet: string;
  isCorrect: boolean | null; // null = 미응답
  selectedChoiceIndex: number | null;
  timeSpentMs: number | null;
  primaryArticleLabel: string | null;
}

export interface QuizSessionResult {
  session: QuizSession;
  items: QuizSessionResultItem[];
  attemptedCount: number;
  correctCount: number;
  totalTimeMs: number;
}

export async function getQuizSessionResult(
  client: SupabaseClient<Database>,
  userId: string,
  sessionId: string,
): Promise<QuizSessionResult | null> {
  const session = await getQuizSession(client, userId, sessionId);
  if (!session) return null;

  // 세션 안의 모든 attempt — 동일 problem 다수 시도 시 최신 한 건만 사용.
  const { data: attemptRows, error: aErr } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_index, is_correct, time_spent_ms, attempted_at",
    )
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("attempted_at", { ascending: false });
  if (aErr) throw aErr;
  const latestByProblem = new Map<
    string,
    {
      isCorrect: boolean;
      selectedChoiceIndex: number | null;
      timeSpentMs: number | null;
    }
  >();
  for (const r of attemptRows ?? []) {
    if (!latestByProblem.has(r.problem_id)) {
      latestByProblem.set(r.problem_id, {
        isCorrect: r.is_correct,
        selectedChoiceIndex: r.selected_choice_index,
        timeSpentMs: r.time_spent_ms,
      });
    }
  }

  const { data: problemRows, error: pErr } = await client
    .from("problems")
    .select(
      "problem_id, problem_number, year, body_md, articles!primary_article_id(display_label)",
    )
    .in("problem_id", session.problemIds);
  if (pErr) throw pErr;
  const problemById = new Map(
    (problemRows ?? []).map((p) => [p.problem_id, p] as const),
  );

  let attemptedCount = 0;
  let correctCount = 0;
  let totalTimeMs = 0;
  const items: QuizSessionResultItem[] = session.problemIds.map((pid) => {
    const p = problemById.get(pid);
    const att = latestByProblem.get(pid);
    if (att) {
      attemptedCount += 1;
      if (att.isCorrect) correctCount += 1;
      if (att.timeSpentMs) totalTimeMs += att.timeSpentMs;
    }
    const body = p?.body_md ?? "";
    return {
      problemId: pid,
      problemNumber: p?.problem_number ?? null,
      year: p?.year ?? null,
      bodySnippet: body.length > 100 ? `${body.slice(0, 100)}…` : body,
      isCorrect: att ? att.isCorrect : null,
      selectedChoiceIndex: att?.selectedChoiceIndex ?? null,
      timeSpentMs: att?.timeSpentMs ?? null,
      primaryArticleLabel: p?.articles?.display_label ?? null,
    };
  });

  return {
    session,
    items,
    attemptedCount,
    correctCount,
    totalTimeMs,
  };
}

// ---- 문제 난이도 (전체 사용자 시도 집계) ----
// 표시용 상수/타입은 client-safe 한 ./lib/difficulty 로 분리.
import {
  bucketDifficulty,
  emptyProblemAggregate,
  MIN_ATTEMPTS_FOR_DIFFICULTY,
  type ProblemAggregateStats,
} from "./lib/difficulty";

export type {
  DifficultyBucket,
  ProblemAggregateStats,
} from "./lib/difficulty";

export async function getProblemStatsBulk(
  client: SupabaseClient<Database>,
  problemIds: string[],
): Promise<Map<string, ProblemAggregateStats>> {
  const out = new Map<string, ProblemAggregateStats>();
  if (problemIds.length === 0) return out;
  const unique = Array.from(new Set(problemIds));
  // PostgREST RPC URL 길이 제한 회피 — 청크.
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await client.rpc("get_problem_stats", {
      p_ids: slice,
    });
    if (error) throw error;
    for (const r of data ?? []) {
      const accuracyPct =
        r.attempts > 0 ? Math.round((r.correct_attempts / r.attempts) * 100) : null;
      out.set(r.problem_id, {
        attempts: r.attempts,
        correctAttempts: r.correct_attempts,
        distinctUsers: r.distinct_users,
        accuracyPct,
        bucket:
          r.attempts >= MIN_ATTEMPTS_FOR_DIFFICULTY && accuracyPct !== null
            ? bucketDifficulty(accuracyPct)
            : null,
      });
    }
  }
  return out;
}

export async function getProblemStats(
  client: SupabaseClient<Database>,
  problemId: string,
): Promise<ProblemAggregateStats> {
  const map = await getProblemStatsBulk(client, [problemId]);
  return map.get(problemId) ?? emptyProblemAggregate();
}

// ---- 미열람 권장 조문 (subject hub Articles 탭) ----
// 사용자가 아직 study_sessions 으로 방문하지 않은 article 중 importance 높은 순.

export interface RecommendedArticleItem {
  articleId: string;
  pathSlug: string;
  displayLabel: string;
  importance: number;
}

export async function getRecommendedArticles(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
  limit = 6,
): Promise<RecommendedArticleItem[]> {
  // 1. 본인이 본 article 모음.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visited = new Set<string>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (
      scope?.subject === lawCode &&
      scope.target_type === "article" &&
      scope.target_id
    ) {
      visited.add(scope.target_id);
    }
  }

  // 2. importance 높은 순으로 articles fetch — visited 제외.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return [];

  // limit 보다 많이 가져와서 클라에서 visited 제외 후 잘라야.
  const { data: rows } = await client
    .from("articles")
    .select("article_id, article_number, display_label, importance")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .order("importance", { ascending: false, nullsFirst: false })
    .order("path", { ascending: true })
    .limit(limit + visited.size + 20);
  const out: RecommendedArticleItem[] = [];
  for (const r of rows ?? []) {
    if (visited.has(r.article_id)) continue;
    if (!r.article_number) continue;
    out.push({
      articleId: r.article_id,
      pathSlug: articleSlug(r.article_number),
      displayLabel: r.display_label,
      importance: r.importance ?? 0,
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---- 최근 학습 피드 (대시보드) ----
// study_sessions 시간순. article/case/problem 라벨 lookup.

export type ActivityType = "article" | "case" | "problem";

export interface RecentActivityItem {
  type: ActivityType;
  targetId: string;
  startedAt: string;
  subject: LawSubjectSlug | null;
  // 표시 라벨 (조문 표기 / 사건번호+제목 / 연도+문항 또는 본문 단편).
  label: string;
  // 클릭 이동 href.
  href: string;
}

export async function getRecentActivity(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 12,
): Promise<RecentActivityItem[]> {
  // 1. 최근 study_sessions (target_id 가 있는 것만).
  const { data: sessRows, error } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  // dedup: 같은 (type+id) 중 최근 1개만.
  const seen = new Set<string>();
  type Pending = {
    type: ActivityType;
    targetId: string;
    startedAt: string;
    subject: LawSubjectSlug | null;
  };
  const pending: Pending[] = [];
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || !scope.target_type) continue;
    if (
      scope.target_type !== "article" &&
      scope.target_type !== "case" &&
      scope.target_type !== "problem"
    )
      continue;
    const key = `${scope.target_type}:${scope.target_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push({
      type: scope.target_type as ActivityType,
      targetId: scope.target_id,
      startedAt: r.started_at,
      subject: (scope.subject as LawSubjectSlug | undefined) ?? null,
    });
    if (pending.length >= limit) break;
  }
  if (pending.length === 0) return [];

  // 2. 라벨 lookup — type 별 bulk.
  const articleIds = pending.filter((p) => p.type === "article").map((p) => p.targetId);
  const caseIds = pending.filter((p) => p.type === "case").map((p) => p.targetId);
  const problemIds = pending.filter((p) => p.type === "problem").map((p) => p.targetId);

  const articleMap = new Map<
    string,
    { displayLabel: string; lawCode: string; pathSlug: string }
  >();
  if (articleIds.length > 0) {
    const { data: rows } = await client
      .from("articles")
      .select(
        "article_id, article_number, display_label, laws!inner(law_code)",
      )
      .in("article_id", articleIds);
    for (const r of rows ?? []) {
      if (!r.article_number) continue;
      articleMap.set(r.article_id, {
        displayLabel: r.display_label,
        lawCode: r.laws.law_code,
        pathSlug: articleSlug(r.article_number),
      });
    }
  }

  const caseMap = new Map<
    string,
    { caseNumber: string; caseTitle: string; lawCode: string }
  >();
  if (caseIds.length > 0) {
    const { data: rows } = await client
      .from("cases")
      .select("case_id, case_number, case_title, subject_laws")
      .in("case_id", caseIds);
    for (const r of rows ?? []) {
      caseMap.set(r.case_id, {
        caseNumber: r.case_number,
        caseTitle: r.case_title,
        lawCode: (r.subject_laws as string[] | null)?.[0] ?? "patent",
      });
    }
  }

  const problemMap = new Map<
    string,
    { snippet: string; year: number | null; problemNumber: number | null; lawCode: string }
  >();
  if (problemIds.length > 0) {
    const { data: rows } = await client
      .from("problems")
      .select(
        "problem_id, body_md, year, problem_number, laws!inner(law_code)",
      )
      .in("problem_id", problemIds);
    for (const r of rows ?? []) {
      const body = r.body_md ?? "";
      problemMap.set(r.problem_id, {
        snippet: body.length > 60 ? `${body.slice(0, 60)}…` : body,
        year: r.year,
        problemNumber: r.problem_number,
        lawCode: r.laws.law_code,
      });
    }
  }

  return pending.flatMap((p): RecentActivityItem[] => {
    if (p.type === "article") {
      const a = articleMap.get(p.targetId);
      if (!a) return [];
      return [
        {
          type: "article",
          targetId: p.targetId,
          startedAt: p.startedAt,
          subject: (a.lawCode as LawSubjectSlug) ?? p.subject,
          label: a.displayLabel,
          href: `/subjects/${a.lawCode}/articles/${a.pathSlug}`,
        },
      ];
    }
    if (p.type === "case") {
      const c = caseMap.get(p.targetId);
      if (!c) return [];
      return [
        {
          type: "case",
          targetId: p.targetId,
          startedAt: p.startedAt,
          subject: (c.lawCode as LawSubjectSlug) ?? p.subject,
          label: `${c.caseNumber} · ${c.caseTitle}`,
          href: `/subjects/${c.lawCode}/cases/${p.targetId}`,
        },
      ];
    }
    const pr = problemMap.get(p.targetId);
    if (!pr) return [];
    const yearLabel = pr.year
      ? `${pr.year}년${pr.problemNumber ? ` · ${pr.problemNumber}번` : ""} — `
      : "";
    return [
      {
        type: "problem",
        targetId: p.targetId,
        startedAt: p.startedAt,
        subject: (pr.lawCode as LawSubjectSlug) ?? p.subject,
        label: `${yearLabel}${pr.snippet}`,
        href: `/subjects/${pr.lawCode}/problems/${p.targetId}`,
      },
    ];
  });
}

// ---- 전체 학습 진척도 (대시보드 도넛) ----
// 모든 과목 합산: 조문(study_sessions article 방문) · 판례(study_sessions case 방문) · 문제(시도한 distinct).

export interface OverallProgress {
  articles: { visited: number; total: number; pct: number };
  cases: { visited: number; total: number; pct: number };
  problems: { attempted: number; total: number; pct: number };
}

export async function getOverallProgress(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<OverallProgress> {
  // 총 조문/판례/문제 수.
  const [
    { count: totalArticles },
    { count: totalCases },
    { count: totalProblems },
  ] = await Promise.all([
    client
      .from("articles")
      .select("article_id", { head: true, count: "exact" })
      .eq("level", "article"),
    client
      .from("cases")
      .select("case_id", { head: true, count: "exact" })
      .is("deleted_at", null),
    client
      .from("problems")
      .select("problem_id", { head: true, count: "exact" })
      .is("deleted_at", null),
  ]);

  // 본인 study_sessions — article/case 방문 distinct.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visitedArticles = new Set<string>();
  const visitedCases = new Set<string>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id) continue;
    if (scope.target_type === "article") visitedArticles.add(scope.target_id);
    else if (scope.target_type === "case") visitedCases.add(scope.target_id);
  }

  // 본인 attempt distinct.
  const { data: attRows } = await client
    .from("user_problem_attempts")
    .select("problem_id")
    .eq("user_id", userId)
    .limit(10000);
  const attempted = new Set<string>();
  for (const r of attRows ?? []) attempted.add(r.problem_id);

  const pctOf = (cur: number, total: number) =>
    total > 0 ? Math.round((cur / total) * 100) : 0;
  return {
    articles: {
      visited: visitedArticles.size,
      total: totalArticles ?? 0,
      pct: pctOf(visitedArticles.size, totalArticles ?? 0),
    },
    cases: {
      visited: visitedCases.size,
      total: totalCases ?? 0,
      pct: pctOf(visitedCases.size, totalCases ?? 0),
    },
    problems: {
      attempted: attempted.size,
      total: totalProblems ?? 0,
      pct: pctOf(attempted.size, totalProblems ?? 0),
    },
  };
}

// ---- 일별 학습 통계 (히트맵·주간 그래프) ----

export interface DailyStudyDay {
  // YYYY-MM-DD (로컬 KST 기준).
  date: string;
  attemptCount: number;
  correctCount: number;
  timeMs: number;
}

export interface DailyStudyStats {
  // 가장 오래된 날짜부터 오늘까지 daysBack 일치 (활동 없는 날은 0).
  days: DailyStudyDay[];
  totalActiveDays: number;
  avgHoursPerActiveDay: number;
  // 오늘 또는 어제부터 연속으로 활동한 일수.
  currentStreak: number;
}

function ymdKst(d: Date): string {
  // KST = UTC+9. supabase 는 UTC timestamptz 로 저장 → 변환.
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getDailyStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  daysBack = 84,
): Promise<DailyStudyStats> {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select("attempted_at, is_correct, time_spent_ms")
    .eq("user_id", userId)
    .gte("attempted_at", since.toISOString())
    .order("attempted_at", { ascending: true })
    .limit(10000);
  if (error) throw error;

  const byDate = new Map<string, DailyStudyDay>();
  for (const r of rows ?? []) {
    const d = ymdKst(new Date(r.attempted_at));
    const cur = byDate.get(d) ?? {
      date: d,
      attemptCount: 0,
      correctCount: 0,
      timeMs: 0,
    };
    cur.attemptCount += 1;
    if (r.is_correct) cur.correctCount += 1;
    if (r.time_spent_ms) cur.timeMs += r.time_spent_ms;
    byDate.set(d, cur);
  }

  // 오래된 → 오늘까지 빈 날 채움.
  const days: DailyStudyDay[] = [];
  for (let i = daysBack - 1; i >= 0; i -= 1) {
    const dt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const ymd = ymdKst(dt);
    days.push(
      byDate.get(ymd) ?? {
        date: ymd,
        attemptCount: 0,
        correctCount: 0,
        timeMs: 0,
      },
    );
  }

  const activeDays = days.filter((d) => d.attemptCount > 0);
  const totalActiveDays = activeDays.length;
  const avgHoursPerActiveDay =
    totalActiveDays > 0
      ? activeDays.reduce((s, d) => s + d.timeMs, 0) /
        totalActiveDays /
        (60 * 60 * 1000)
      : 0;

  // 오늘부터 거꾸로 연속 활동 카운트. 오늘 활동이 없으면 어제부터.
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].attemptCount > 0) currentStreak += 1;
    else if (i === days.length - 1) continue; // 오늘 0 이면 어제부터 시작 가능
    else break;
  }

  return { days, totalActiveDays, avgHoursPerActiveDay, currentStreak };
}

// 대시보드 상단 3종 KPI — 모든 과목 합산.
export interface DashboardKpis {
  // 누적 풀이 시간 (ms). user_problem_attempts.time_spent_ms 합.
  totalProblemTimeMs: number;
  // 시도한 distinct 문제 수 (모든 과목 합).
  totalProblemsAttempted: number;
  // 모든 시도 중 정답률 % (정수). 시도 0 이면 0.
  overallAccuracyPct: number;
  // 최근 7일 KPI (델타 계산용).
  last7d: {
    totalProblemTimeMs: number;
    totalProblemsAttempted: number;
  };
}

export async function getDashboardKpis(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<DashboardKpis> {
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, time_spent_ms, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const list = rows ?? [];

  const distinct = new Set<string>();
  let correct = 0;
  let timeMs = 0;
  const distinct7d = new Set<string>();
  let timeMs7d = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const r of list) {
    distinct.add(r.problem_id);
    if (r.is_correct) correct += 1;
    if (r.time_spent_ms) timeMs += r.time_spent_ms;
    const t = new Date(r.attempted_at).getTime();
    if (t >= sevenDaysAgo) {
      distinct7d.add(r.problem_id);
      if (r.time_spent_ms) timeMs7d += r.time_spent_ms;
    }
  }

  return {
    totalProblemTimeMs: timeMs,
    totalProblemsAttempted: distinct.size,
    overallAccuracyPct: list.length > 0 ? Math.round((correct / list.length) * 100) : 0,
    last7d: {
      totalProblemTimeMs: timeMs7d,
      totalProblemsAttempted: distinct7d.size,
    },
  };
}

export interface SubjectProgressRow {
  lawCode: LawSubjectSlug;
  name: string;
  pctViewed: number;
  visitedCount: number;
  totalArticleCount: number;
  problemsAttempted: number;
  accuracyPct: number | null;
}

// 5과목 진도 한 번에. UI 가 카드 5개 동시에 그릴 때 사용.
export async function getAllSubjectsProgress(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
): Promise<SubjectProgressRow[]> {
  // 각 law 의 article 총수 한 번에.
  const slugs = lawCodes.map((s) => s.slug) as string[];
  const { data: lawRows } = await client
    .from("laws")
    .select("law_id, law_code")
    .in("law_code", slugs);
  const lawByCode = new Map((lawRows ?? []).map((l) => [l.law_code, l.law_id]));

  // article 총수 — laws.law_id 별 count.
  const totals = new Map<string, number>();
  await Promise.all(
    Array.from(lawByCode.entries()).map(async ([code, lid]) => {
      const { count } = await client
        .from("articles")
        .select("article_id", { head: true, count: "exact" })
        .eq("law_id", lid)
        .eq("level", "article");
      totals.set(code, count ?? 0);
    }),
  );

  // 본 article (study_sessions). 한 번에 가져와 과목별 분류.
  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope, started_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(2000);
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.subject || scope.target_type !== "article" || !scope.target_id) continue;
    if (!visitedBySubject.has(scope.subject))
      visitedBySubject.set(scope.subject, new Set());
    visitedBySubject.get(scope.subject)!.add(scope.target_id);
  }

  // 문제 시도 — law_id 조인.
  const { data: attRows } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, problems!inner(law_id)")
    .eq("user_id", userId)
    .limit(5000);
  const distinctByLaw = new Map<string, Set<string>>();
  const correctByLaw = new Map<string, { correct: number; total: number }>();
  for (const r of attRows ?? []) {
    const lid = r.problems.law_id;
    if (!lid) continue;
    if (!distinctByLaw.has(lid)) distinctByLaw.set(lid, new Set());
    distinctByLaw.get(lid)!.add(r.problem_id);
    const cur = correctByLaw.get(lid) ?? { correct: 0, total: 0 };
    cur.total += 1;
    if (r.is_correct) cur.correct += 1;
    correctByLaw.set(lid, cur);
  }

  return lawCodes.map(({ slug, name }) => {
    const lid = lawByCode.get(slug);
    const total = totals.get(slug) ?? 0;
    const visited = visitedBySubject.get(slug)?.size ?? 0;
    const distinctAttempted = lid ? (distinctByLaw.get(lid)?.size ?? 0) : 0;
    const acc = lid ? correctByLaw.get(lid) : null;
    return {
      lawCode: slug,
      name,
      pctViewed: total > 0 ? Math.round((visited / total) * 100) : 0,
      visitedCount: visited,
      totalArticleCount: total,
      problemsAttempted: distinctAttempted,
      accuracyPct: acc && acc.total > 0 ? Math.round((acc.correct / acc.total) * 100) : null,
    };
  });
}

export interface UserProblemStats {
  // 시도한 distinct 문제 수.
  attemptedCount: number;
  // 한 번이라도 정답 본 문제 수.
  correctCount: number;
  // 가장 최근 시도가 오답인 문제 수 (오답노트 큐).
  wrongCount: number;
  // 전체 시도 횟수 (대수롭지 않은 보조 지표).
  totalAttempts: number;
}

// 과목 단위 문제 풀이 통계 — 1차/2차 합산. lawCode 필터로 좁힘.
export async function getUserProblemStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode: LawSubjectSlug,
): Promise<UserProblemStats> {
  // 시도한 모든 (problem_id, attempted_at, is_correct) 가져온 뒤 클라에서 집계.
  // 과목 필터: problems.law_id 매핑.
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) {
    return { attemptedCount: 0, correctCount: 0, wrongCount: 0, totalAttempts: 0 };
  }
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select("problem_id, is_correct, attempted_at, problems!inner(law_id)")
    .eq("user_id", userId)
    .eq("problems.law_id", law.law_id)
    .order("attempted_at", { ascending: false });
  if (error) throw error;
  const list = rows ?? [];
  const distinct = new Set<string>();
  const everCorrect = new Set<string>();
  const lastByProblem = new Map<string, boolean>();
  for (const r of list) {
    distinct.add(r.problem_id);
    if (r.is_correct) everCorrect.add(r.problem_id);
    if (!lastByProblem.has(r.problem_id)) {
      lastByProblem.set(r.problem_id, r.is_correct);
    }
  }
  let wrongCount = 0;
  for (const v of lastByProblem.values()) if (!v) wrongCount += 1;
  return {
    attemptedCount: distinct.size,
    correctCount: everCorrect.size,
    wrongCount,
    totalAttempts: list.length,
  };
}

export interface WrongAttemptItem {
  problemId: string;
  lastAttemptedAt: string;
  attempts: number;
  bodySnippet: string;
  primaryArticleLabel: string | null;
  lawCode: LawSubjectSlug;
  year: number | null;
  problemNumber: number | null;
}

// ---- 약점 지표 (대시보드 위젯) ----
// "내 오답 + 글로벌 난이도(어려움 우선)" 정렬된 top N.

export interface WeakAreaItem {
  problemId: string;
  bodySnippet: string;
  lawCode: LawSubjectSlug;
  primaryArticleLabel: string | null;
  year: number | null;
  problemNumber: number | null;
  // 내 시도 통계.
  myAttempts: number;
  myLastWrongAt: string;
  // 글로벌 통계.
  globalAccuracyPct: number | null;
  globalAttempts: number;
  bucket: import("./lib/difficulty").DifficultyBucket | null;
}

export async function getWeakAreas(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 5,
): Promise<WeakAreaItem[]> {
  // 1. 본인 attempts 최신 → 마지막이 오답인 problem 만 후보.
  const wrongs = await listWrongAttempts(client, userId);
  if (wrongs.length === 0) return [];

  // 2. 후보 problem_id 들의 글로벌 통계.
  const aggMap = await getProblemStatsBulk(
    client,
    wrongs.map((w) => w.problemId),
  );

  // 3. 정렬: 어려운 글로벌 (낮은 정답률) 먼저, 동률이면 본인 시도 많은 순.
  const enriched: WeakAreaItem[] = wrongs.map((w) => {
    const agg = aggMap.get(w.problemId);
    return {
      problemId: w.problemId,
      bodySnippet: w.bodySnippet,
      lawCode: w.lawCode,
      primaryArticleLabel: w.primaryArticleLabel,
      year: w.year,
      problemNumber: w.problemNumber,
      myAttempts: w.attempts,
      myLastWrongAt: w.lastAttemptedAt,
      globalAccuracyPct: agg?.accuracyPct ?? null,
      globalAttempts: agg?.attempts ?? 0,
      bucket: agg?.bucket ?? null,
    };
  });
  enriched.sort((a, b) => {
    const accA = a.globalAccuracyPct ?? 100;
    const accB = b.globalAccuracyPct ?? 100;
    if (accA !== accB) return accA - accB;
    return b.myAttempts - a.myAttempts;
  });
  return enriched.slice(0, limit);
}

// 가장 최근 시도가 오답인 문제 목록 (오답노트 — 일반 객관식). lawCode 미지정 시 전체 과목.
// OX 시도는 ref(choice/box-item) 단위 채점이라 별도 listOxWrongAttempts 가 처리.
export async function listWrongAttempts(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode?: LawSubjectSlug,
): Promise<WrongAttemptItem[]> {
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, is_correct, attempted_at, problems!inner(body_md, year, problem_number, primary_article_id, law_id, articles!primary_article_id(display_label), laws!inner(law_code))",
    )
    .eq("user_id", userId)
    .is("ox_answer", null)
    .order("attempted_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const list = rows ?? [];
  const lastByProblem = new Map<
    string,
    { row: (typeof list)[number]; attempts: number }
  >();
  for (const r of list) {
    const cur = lastByProblem.get(r.problem_id);
    if (!cur) {
      lastByProblem.set(r.problem_id, { row: r, attempts: 1 });
    } else {
      cur.attempts += 1;
    }
  }
  const out: WrongAttemptItem[] = [];
  for (const { row, attempts } of lastByProblem.values()) {
    if (row.is_correct) continue;
    const probLawCode = (row.problems.laws.law_code as LawSubjectSlug) ?? "patent";
    if (lawCode && probLawCode !== lawCode) continue;
    const body = row.problems.body_md ?? "";
    out.push({
      problemId: row.problem_id,
      lastAttemptedAt: row.attempted_at,
      attempts,
      bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
      primaryArticleLabel: row.problems.articles?.display_label ?? null,
      lawCode: probLawCode,
      year: row.problems.year,
      problemNumber: row.problems.problem_number,
    });
  }
  out.sort(
    (a, b) =>
      new Date(b.lastAttemptedAt).getTime() -
      new Date(a.lastAttemptedAt).getTime(),
  );
  return out;
}

export interface OxWrongAttemptItem {
  refType: "choice" | "box";
  refId: string;
  problemId: string;
  bodySnippet: string;
  oxTruth: "O" | "X";
  myAnswer: "O" | "X";
  lastAttemptedAt: string;
  attempts: number;
  primaryArticleLabel: string | null;
  articleNumber: string | null;
  lawCode: LawSubjectSlug;
  year: number | null;
  problemNumber: number | null;
}

// OX 오답 목록. ref(choice 또는 box_item) 단위로 dedup 한 뒤,
// 가장 최근 응답이 오답인 항목만 노출. 정답 후에는 자동 제거.
export async function listOxWrongAttempts(
  client: SupabaseClient<Database>,
  userId: string,
  lawCode?: LawSubjectSlug,
): Promise<OxWrongAttemptItem[]> {
  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select(
      "problem_id, selected_choice_id, selected_box_item_id, ox_answer, is_correct, attempted_at",
    )
    .eq("user_id", userId)
    .not("ox_answer", "is", null)
    .order("attempted_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  const list = rows ?? [];

  type Row = (typeof list)[number];
  const byRef = new Map<string, { row: Row; attempts: number }>();
  for (const r of list) {
    const refKey = r.selected_choice_id
      ? `c:${r.selected_choice_id}`
      : r.selected_box_item_id
        ? `b:${r.selected_box_item_id}`
        : null;
    if (!refKey) continue;
    const cur = byRef.get(refKey);
    if (!cur) {
      byRef.set(refKey, { row: r, attempts: 1 });
    } else {
      cur.attempts += 1;
    }
  }

  const choiceIds: string[] = [];
  const boxIds: string[] = [];
  const wrongRefs: { refKey: string; row: Row; attempts: number }[] = [];
  for (const [refKey, v] of byRef.entries()) {
    if (v.row.is_correct) continue;
    wrongRefs.push({ refKey, ...v });
    if (v.row.selected_choice_id) choiceIds.push(v.row.selected_choice_id);
    else if (v.row.selected_box_item_id) boxIds.push(v.row.selected_box_item_id);
  }
  if (wrongRefs.length === 0) return [];

  const choiceMap = new Map<
    string,
    {
      bodyMd: string | null;
      articleId: string | null;
      problemId: string;
    }
  >();
  if (choiceIds.length > 0) {
    const { data: cRows } = await client
      .from("problem_choices")
      .select("choice_id, body_md, related_article_id, problem_id")
      .in("choice_id", choiceIds);
    for (const c of cRows ?? []) {
      choiceMap.set(c.choice_id, {
        bodyMd: c.body_md,
        articleId: c.related_article_id,
        problemId: c.problem_id,
      });
    }
  }

  const boxMap = new Map<
    string,
    {
      bodyMd: string | null;
      marker: string | null;
      articleId: string | null;
      problemId: string;
    }
  >();
  if (boxIds.length > 0) {
    const { data: bRows } = await client
      .from("problem_box_items")
      .select("box_item_id, body_md, marker, related_article_id, problem_id")
      .in("box_item_id", boxIds);
    for (const b of bRows ?? []) {
      boxMap.set(b.box_item_id, {
        bodyMd: b.body_md,
        marker: b.marker,
        articleId: b.related_article_id,
        problemId: b.problem_id,
      });
    }
  }

  const articleIds = new Set<string>();
  for (const c of choiceMap.values()) if (c.articleId) articleIds.add(c.articleId);
  for (const b of boxMap.values()) if (b.articleId) articleIds.add(b.articleId);

  const articleMap = new Map<
    string,
    { displayLabel: string; articleNumber: string | null }
  >();
  if (articleIds.size > 0) {
    const { data: aRows } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .in("article_id", [...articleIds]);
    for (const a of aRows ?? []) {
      articleMap.set(a.article_id, {
        displayLabel: a.display_label,
        articleNumber: a.article_number,
      });
    }
  }

  const problemIds = new Set<string>();
  for (const c of choiceMap.values()) problemIds.add(c.problemId);
  for (const b of boxMap.values()) problemIds.add(b.problemId);

  const problemMap = new Map<
    string,
    { year: number | null; problemNumber: number | null; lawCode: LawSubjectSlug }
  >();
  if (problemIds.size > 0) {
    const { data: pRows } = await client
      .from("problems")
      .select("problem_id, year, problem_number, deleted_at, laws!inner(law_code)")
      .in("problem_id", [...problemIds]);
    for (const p of pRows ?? []) {
      if (p.deleted_at) continue;
      problemMap.set(p.problem_id, {
        year: p.year,
        problemNumber: p.problem_number,
        lawCode: (p.laws.law_code as LawSubjectSlug) ?? "patent",
      });
    }
  }

  // OX 정답(ox_truth) 은 ref 의 원본에서 다시 조회. 시점 차이로 ox_truth 가 바뀌었어도
  // 사용자가 최근에 잘못 답한 사실은 유효 — 현재 정답값을 표시.
  const choiceTruthMap = new Map<string, "O" | "X" | null>();
  if (choiceIds.length > 0) {
    const { data: ct } = await client
      .from("problem_choices")
      .select("choice_id, ox_truth")
      .in("choice_id", choiceIds);
    for (const r of ct ?? []) choiceTruthMap.set(r.choice_id, r.ox_truth as "O" | "X" | null);
  }
  const boxTruthMap = new Map<string, "O" | "X" | null>();
  if (boxIds.length > 0) {
    const { data: bt } = await client
      .from("problem_box_items")
      .select("box_item_id, ox_truth")
      .in("box_item_id", boxIds);
    for (const r of bt ?? []) boxTruthMap.set(r.box_item_id, r.ox_truth as "O" | "X" | null);
  }

  const out: OxWrongAttemptItem[] = [];
  for (const w of wrongRefs) {
    const myAnswer = w.row.ox_answer as "O" | "X";
    if (w.row.selected_choice_id) {
      const c = choiceMap.get(w.row.selected_choice_id);
      if (!c) continue;
      const prob = problemMap.get(c.problemId);
      if (!prob) continue;
      const truth = choiceTruthMap.get(w.row.selected_choice_id);
      if (!truth) continue;
      if (lawCode && prob.lawCode !== lawCode) continue;
      const body = c.bodyMd ?? "";
      const art = c.articleId ? articleMap.get(c.articleId) : null;
      out.push({
        refType: "choice",
        refId: w.row.selected_choice_id,
        problemId: c.problemId,
        bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        oxTruth: truth,
        myAnswer,
        lastAttemptedAt: w.row.attempted_at,
        attempts: w.attempts,
        primaryArticleLabel: art?.displayLabel ?? null,
        articleNumber: art?.articleNumber ?? null,
        lawCode: prob.lawCode,
        year: prob.year,
        problemNumber: prob.problemNumber,
      });
    } else if (w.row.selected_box_item_id) {
      const b = boxMap.get(w.row.selected_box_item_id);
      if (!b) continue;
      const prob = problemMap.get(b.problemId);
      if (!prob) continue;
      const truth = boxTruthMap.get(w.row.selected_box_item_id);
      if (!truth) continue;
      if (lawCode && prob.lawCode !== lawCode) continue;
      const rawBody = b.bodyMd ?? "";
      const body = b.marker ? `[${b.marker}] ${rawBody}` : rawBody;
      const art = b.articleId ? articleMap.get(b.articleId) : null;
      out.push({
        refType: "box",
        refId: w.row.selected_box_item_id,
        problemId: b.problemId,
        bodySnippet: body.length > 120 ? `${body.slice(0, 120)}…` : body,
        oxTruth: truth,
        myAnswer,
        lastAttemptedAt: w.row.attempted_at,
        attempts: w.attempts,
        primaryArticleLabel: art?.displayLabel ?? null,
        articleNumber: art?.articleNumber ?? null,
        lawCode: prob.lawCode,
        year: prob.year,
        problemNumber: prob.problemNumber,
      });
    }
  }

  out.sort(
    (a, b) =>
      new Date(b.lastAttemptedAt).getTime() -
      new Date(a.lastAttemptedAt).getTime(),
  );
  return out;
}

// ──────── 통합 학습 통계 페이지 (feat-2-008) ────────

export interface ArticleStudyStats {
  visitedDistinct: number;
  totalArticles: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
    bookmarks: number;
    memos: number;
    highlights: number;
  }>;
}

export async function getArticleStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
): Promise<ArticleStudyStats> {
  const slugs = lawCodes.map((s) => s.slug) as string[];
  const { data: lawRows } = await client
    .from("laws")
    .select("law_id, law_code")
    .in("law_code", slugs);
  const lawByCode = new Map((lawRows ?? []).map((l) => [l.law_code, l.law_id]));
  const codeByLawId = new Map(
    (lawRows ?? []).map((l) => [l.law_id, l.law_code]),
  );

  const totals = new Map<string, number>();
  await Promise.all(
    Array.from(lawByCode.entries()).map(async ([code, lid]) => {
      const { count } = await client
        .from("articles")
        .select("article_id", { head: true, count: "exact" })
        .eq("law_id", lid)
        .eq("level", "article");
      totals.set(code, count ?? 0);
    }),
  );

  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visitedAll = new Set<string>();
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || scope.target_type !== "article") continue;
    visitedAll.add(scope.target_id);
    const subj = scope.subject;
    if (subj) {
      if (!visitedBySubject.has(subj)) visitedBySubject.set(subj, new Set());
      visitedBySubject.get(subj)!.add(scope.target_id);
    }
  }

  const fetchAnnotationIds = async (
    table: "user_bookmarks" | "user_memos" | "user_highlights",
  ): Promise<string[]> => {
    let q = client
      .from(table)
      .select("target_id")
      .eq("user_id", userId)
      .eq("target_type", "article")
      .is("deleted_at", null);
    if (table === "user_bookmarks") q = q.gt("star_level", 0);
    const { data } = await q.limit(10000);
    return (data ?? []).map((r) => r.target_id as string);
  };
  const [bookmarkIds, memoIds, highlightIds] = await Promise.all([
    fetchAnnotationIds("user_bookmarks"),
    fetchAnnotationIds("user_memos"),
    fetchAnnotationIds("user_highlights"),
  ]);

  const allArticleIds = Array.from(
    new Set([...bookmarkIds, ...memoIds, ...highlightIds]),
  );
  const lawIdByArticleId = new Map<string, string>();
  if (allArticleIds.length > 0) {
    const { data: arts } = await client
      .from("articles")
      .select("article_id, law_id")
      .in("article_id", allArticleIds);
    for (const a of arts ?? []) {
      if (a.law_id) lawIdByArticleId.set(a.article_id, a.law_id);
    }
  }

  const countBySubject = (ids: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const aid of ids) {
      const lid = lawIdByArticleId.get(aid);
      const code = lid ? codeByLawId.get(lid) : undefined;
      if (!code) continue;
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    return m;
  };
  const bookmarkBy = countBySubject(bookmarkIds);
  const memoBy = countBySubject(memoIds);
  const highlightBy = countBySubject(highlightIds);

  return {
    visitedDistinct: visitedAll.size,
    totalArticles: Array.from(totals.values()).reduce((a, b) => a + b, 0),
    bookmarks: bookmarkIds.length,
    memos: memoIds.length,
    highlights: highlightIds.length,
    bySubject: lawCodes.map(({ slug, name }) => ({
      lawCode: slug,
      name,
      visited: visitedBySubject.get(slug)?.size ?? 0,
      total: totals.get(slug) ?? 0,
      bookmarks: bookmarkBy.get(slug) ?? 0,
      memos: memoBy.get(slug) ?? 0,
      highlights: highlightBy.get(slug) ?? 0,
    })),
  };
}

export interface CaseStudyStats {
  visitedDistinct: number;
  totalCases: number;
  bookmarks: number;
  memos: number;
  highlights: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    visited: number;
    total: number;
  }>;
}

export async function getCaseStudyStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
): Promise<CaseStudyStats> {
  const { count: totalCases } = await client
    .from("cases")
    .select("case_id", { head: true, count: "exact" })
    .is("deleted_at", null);

  const { data: sessRows } = await client
    .from("study_sessions")
    .select("scope")
    .eq("user_id", userId)
    .limit(5000);
  const visitedAll = new Set<string>();
  const visitedBySubject = new Map<string, Set<string>>();
  for (const r of sessRows ?? []) {
    const scope = r.scope as Partial<StudyScope> | null;
    if (!scope?.target_id || scope.target_type !== "case") continue;
    visitedAll.add(scope.target_id);
    const subj = scope.subject;
    if (subj) {
      if (!visitedBySubject.has(subj)) visitedBySubject.set(subj, new Set());
      visitedBySubject.get(subj)!.add(scope.target_id);
    }
  }

  const totalsBySubject = new Map<string, number>();
  await Promise.all(
    lawCodes.map(async ({ slug }) => {
      const { count } = await client
        .from("cases")
        .select("case_id", { head: true, count: "exact" })
        .is("deleted_at", null)
        .contains("subject_laws", [slug]);
      totalsBySubject.set(slug, count ?? 0);
    }),
  );

  const fetchCount = async (
    table: "user_bookmarks" | "user_memos" | "user_highlights",
  ): Promise<number> => {
    let q = client
      .from(table)
      .select("target_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("target_type", "case")
      .is("deleted_at", null);
    if (table === "user_bookmarks") q = q.gt("star_level", 0);
    const { count } = await q;
    return count ?? 0;
  };
  const [bookmarks, memos, highlights] = await Promise.all([
    fetchCount("user_bookmarks"),
    fetchCount("user_memos"),
    fetchCount("user_highlights"),
  ]);

  return {
    visitedDistinct: visitedAll.size,
    totalCases: totalCases ?? 0,
    bookmarks,
    memos,
    highlights,
    bySubject: lawCodes.map(({ slug, name }) => ({
      lawCode: slug,
      name,
      visited: visitedBySubject.get(slug)?.size ?? 0,
      total: totalsBySubject.get(slug) ?? 0,
    })),
  };
}

export interface UserSubjectiveStats {
  totalAttempts: number;
  submittedAttempts: number;
  avgSelfScore: number | null;
  reviewRequested: number;
  reviewCompleted: number;
  bySubject: Array<{
    lawCode: LawSubjectSlug;
    name: string;
    attempts: number;
    avgSelfScore: number | null;
  }>;
}

export async function getUserSubjectiveStats(
  client: SupabaseClient<Database>,
  userId: string,
  lawCodes: ReadonlyArray<{ slug: LawSubjectSlug; name: string }>,
): Promise<UserSubjectiveStats> {
  const { data: rows, error } = await client
    .from("user_subjective_attempts")
    .select(
      "attempt_id, self_score, submitted_at, review_requested_at, review_completed_at, problems!inner(law_id, laws!inner(law_code))",
    )
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw error;
  const list = rows ?? [];

  let submitted = 0;
  let reviewRequested = 0;
  let reviewCompleted = 0;
  const selfScores: number[] = [];
  const byCode = new Map<string, { attempts: number; scores: number[] }>();
  for (const r of list) {
    if (r.submitted_at) submitted += 1;
    if (r.review_requested_at && !r.review_completed_at) reviewRequested += 1;
    if (r.review_completed_at) reviewCompleted += 1;
    if (r.self_score != null) selfScores.push(r.self_score);
    const code = r.problems?.laws?.law_code;
    if (code) {
      if (!byCode.has(code)) byCode.set(code, { attempts: 0, scores: [] });
      const c = byCode.get(code)!;
      c.attempts += 1;
      if (r.self_score != null) c.scores.push(r.self_score);
    }
  }
  const avg = (xs: number[]): number | null =>
    xs.length === 0
      ? null
      : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    totalAttempts: list.length,
    submittedAttempts: submitted,
    avgSelfScore: avg(selfScores),
    reviewRequested,
    reviewCompleted,
    bySubject: lawCodes.map(({ slug, name }) => {
      const c = byCode.get(slug);
      return {
        lawCode: slug,
        name,
        attempts: c?.attempts ?? 0,
        avgSelfScore: c ? avg(c.scores) : null,
      };
    }),
  };
}

// ─── 합격 진단 정밀화 (feat-7-024 정밀화) ────────────────────────────────

// 본인 GS(2차 모의) 평균 점수 % — 채점 완료된 응시만. 데이터 없으면 null.
export async function getUserGsAveragePct(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<number | null> {
  const { data: subs } = await client
    .from("gs_submissions")
    .select("submission_id, total_score, round_id")
    .eq("user_id", userId)
    .not("graded_at", "is", null);
  if (!subs || subs.length === 0) return null;
  const roundIds = Array.from(new Set(subs.map((s) => s.round_id)));
  const { data: questions } = await client
    .from("gs_questions")
    .select("round_id, max_score")
    .in("round_id", roundIds);
  const maxByRound = new Map<string, number>();
  for (const q of questions ?? []) {
    maxByRound.set(
      q.round_id,
      (maxByRound.get(q.round_id) ?? 0) + (q.max_score ?? 0),
    );
  }
  const pctList: number[] = [];
  for (const s of subs) {
    const max = maxByRound.get(s.round_id) ?? 0;
    if (max > 0 && s.total_score !== null) {
      pctList.push(((s.total_score ?? 0) / max) * 100);
    }
  }
  if (pctList.length === 0) return null;
  return (
    Math.round((pctList.reduce((a, b) => a + b, 0) / pctList.length) * 10) / 10
  );
}

// 본인 주별 정답률 추이 — 최근 N주(기본 12주). KST Monday 기준.
export interface UserWeeklyAccuracyItem {
  weekStart: string; // YYYY-MM-DD
  label: string; // "11주 전" ~ "이번 주"
  totalAttempts: number;
  correctAttempts: number;
  accuracyPct: number | null;
}

export interface UserWeeklyAccuracyTrend {
  weeks: UserWeeklyAccuracyItem[];
}

function ymdKstLocal(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

function mondayStartKstLocal(d: Date): Date {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const day = k.getUTCDay();
  const diff = (day + 6) % 7;
  k.setUTCHours(0, 0, 0, 0);
  k.setUTCDate(k.getUTCDate() - diff);
  return new Date(k.getTime() - 9 * 3600 * 1000);
}

export async function getUserAccuracyTrend(
  client: SupabaseClient<Database>,
  userId: string,
  weekCount = 12,
): Promise<UserWeeklyAccuracyTrend> {
  const thisWeekStart = mondayStartKstLocal(new Date());
  const oldestStart = new Date(
    thisWeekStart.getTime() - (weekCount - 1) * 7 * 24 * 3600 * 1000,
  );

  const { data: rows, error } = await client
    .from("user_problem_attempts")
    .select("attempted_at, is_correct")
    .eq("user_id", userId)
    .gte("attempted_at", oldestStart.toISOString())
    .limit(20000);
  if (error) throw error;

  const byWeek = new Map<string, { total: number; correct: number }>();
  for (const r of rows ?? []) {
    const weekStart = mondayStartKstLocal(new Date(r.attempted_at));
    const key = ymdKstLocal(weekStart);
    const entry = byWeek.get(key) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
    byWeek.set(key, entry);
  }

  const weeks: UserWeeklyAccuracyItem[] = [];
  for (let i = weekCount - 1; i >= 0; i--) {
    const ws = new Date(thisWeekStart.getTime() - i * 7 * 24 * 3600 * 1000);
    const key = ymdKstLocal(ws);
    const entry = byWeek.get(key);
    const total = entry?.total ?? 0;
    const correct = entry?.correct ?? 0;
    const label = i === 0 ? "이번 주" : `${i}주 전`;
    weeks.push({
      weekStart: key,
      label,
      totalAttempts: total,
      correctAttempts: correct,
      accuracyPct:
        total > 0 ? Math.round((correct / total) * 1000) / 10 : null,
    });
  }
  return { weeks };
}

// 합격 진단 점수 시계열 (feat-7-027) — pass_prediction_snapshots 의 최근 N일.
export interface PassPredictionSnapshotItem {
  snapshotDate: string; // YYYY-MM-DD
  score: number;
  rating: string;
}

export async function getUserPassPredictionTrend(
  client: SupabaseClient<Database>,
  userId: string,
  days = 30,
): Promise<PassPredictionSnapshotItem[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await client
    .from("pass_prediction_snapshots")
    .select("snapshot_date, score, rating")
    .eq("user_id", userId)
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    snapshotDate: r.snapshot_date,
    score: r.score,
    rating: r.rating,
  }));
}
