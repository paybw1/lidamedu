// feat-2-010 SRS — 서버 측 hook + 조회 헬퍼.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type SrsState,
  computeNextSrsState,
  reviewDueCutoffIso,
  reviewDueCutoffMs,
} from "~/features/study/lib/srs";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface ProblemSrsOutcome {
  userId: string;
  problemId: string;
  isCorrect: boolean;
}

const SRS_IN_BATCH = 150; // ★대량 .in() URL 초과 방지
const SRS_UPSERT_BATCH = 500;

/**
 * 여러 (user, problem) 의 SRS 를 일괄 갱신 — 계산은 computeNextSrsState 공유.
 * 동일 키 복수 출현 시 "하나라도 오답이면 오답"으로 집계(오프라인 시험 집계 규칙과 통일).
 * 쿼리 수는 대상 수의 배치 단위(150/500)에만 비례 — 문항×학생 단건 루프 금지.
 * 실패는 throw — best-effort 가 필요한 호출자는 applyProblemSrsUpdate 를 쓴다.
 */
export async function applyProblemSrsBulk(
  client: SupabaseClient<Database>,
  outcomes: ProblemSrsOutcome[],
): Promise<void> {
  // (userId, problemId) dedup — AND 집계.
  const byKey = new Map<string, ProblemSrsOutcome>();
  for (const o of outcomes) {
    const key = `${o.userId}|${o.problemId}`;
    const cur = byKey.get(key);
    byKey.set(key, cur ? { ...cur, isCorrect: cur.isCorrect && o.isCorrect } : { ...o });
  }
  const items = [...byKey.values()];
  if (items.length === 0) return;

  // 기존 행 일괄 조회 — user×problem 교차곱 과조회는 메모리에서 키 필터.
  const userIds = [...new Set(items.map((i) => i.userId))];
  const problemIds = [...new Set(items.map((i) => i.problemId))];
  const prevByKey = new Map<
    string,
    { interval_days: number; ease: number; reps: number; lapses: number }
  >();
  for (let from = 0; from < problemIds.length; from += SRS_IN_BATCH) {
    const slice = problemIds.slice(from, from + SRS_IN_BATCH);
    const { data, error } = await client
      .from("user_problem_srs")
      .select("user_id, problem_id, interval_days, ease, reps, lapses")
      .in("user_id", userIds)
      .in("problem_id", slice);
    if (error) throw error;
    for (const r of data ?? []) {
      prevByKey.set(`${r.user_id}|${r.problem_id}`, {
        interval_days: r.interval_days,
        ease: Number(r.ease),
        reps: r.reps,
        lapses: r.lapses,
      });
    }
  }

  const now = new Date().toISOString();
  const rows = items.map((i) => {
    const prev = prevByKey.get(`${i.userId}|${i.problemId}`);
    const prevState: SrsState | null = prev
      ? {
          intervalDays: prev.interval_days,
          ease: prev.ease,
          reps: prev.reps,
          lapses: prev.lapses,
        }
      : null;
    const next = computeNextSrsState({ prev: prevState, isCorrect: i.isCorrect });
    return {
      user_id: i.userId,
      problem_id: i.problemId,
      next_due_at: next.nextDueAt.toISOString(),
      interval_days: next.intervalDays,
      ease: next.ease,
      last_quality: next.lastQuality,
      last_reviewed_at: now,
      lapses: next.lapses,
      reps: next.reps,
      updated_at: now,
    };
  });
  for (let from = 0; from < rows.length; from += SRS_UPSERT_BATCH) {
    const { error } = await client
      .from("user_problem_srs")
      .upsert(rows.slice(from, from + SRS_UPSERT_BATCH), {
        onConflict: "user_id,problem_id",
      });
    if (error) throw error;
  }
}

/**
 * 시도 후 SRS 상태 upsert — applyProblemSrsBulk 단일 원소 위임(쓰기 경로 일원화).
 * 호출처 = recordProblemAttempt. best-effort — 실패해도 attempt 자체는 성공.
 */
export async function applyProblemSrsUpdate(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  isCorrect: boolean,
): Promise<void> {
  try {
    await applyProblemSrsBulk(client, [{ userId, problemId, isCorrect }]);
  } catch (err) {
    console.error("[srs] applyProblemSrsUpdate failed:", err);
  }
}

export interface DueProblemItem {
  problemId: string;
  lawCode: LawSubjectSlug;
  primaryArticleLabel: string | null;
  bodySnippet: string;
  year: number | null;
  problemNumber: number | null;
  nextDueAt: string;
  intervalDays: number;
  reps: number;
  lapses: number;
  /** 음수 = 지났음 (overdue days). 0 이상 = 아직 도래 안 함. */
  daysUntilDue: number;
}

/** 본인 SRS due 항목 (next_due_at <= now). overdue 가장 오래된 것 우선. */
export async function getDueProblems(
  client: SupabaseClient<Database>,
  userId: string,
  limit = 50,
): Promise<DueProblemItem[]> {
  const { data, error } = await client
    .from("user_problem_srs")
    .select(
      "problem_id, next_due_at, interval_days, reps, lapses, problems!inner(body_md, year, problem_number, primary_article_id, articles!primary_article_id(display_label), laws!inner(law_code))",
    )
    .eq("user_id", userId)
    .lte("next_due_at", reviewDueCutoffIso())
    .order("next_due_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const now = Date.now();
  return (data ?? []).map((r) => {
    const due = new Date(r.next_due_at).getTime();
    return {
      problemId: r.problem_id,
      lawCode: (r.problems.laws.law_code as LawSubjectSlug) ?? "patent",
      primaryArticleLabel: r.problems.articles?.display_label ?? null,
      bodySnippet: (r.problems.body_md ?? "").slice(0, 100),
      year: r.problems.year,
      problemNumber: r.problems.problem_number,
      nextDueAt: r.next_due_at,
      intervalDays: r.interval_days,
      reps: r.reps,
      lapses: r.lapses,
      daysUntilDue: Math.floor((due - now) / 86_400_000),
    };
  });
}

export interface SrsCounts {
  due: number;        // 지금 due (next_due_at <= now)
  upcoming7d: number; // 7일 내 도래
  total: number;      // 전체 보유 SRS 항목
  lapsesSum: number;  // 누적 실패 합산
}

export async function getSrsCounts(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SrsCounts> {
  const cutoffIso = reviewDueCutoffIso();
  const sevenDays = new Date(
    reviewDueCutoffMs() + 7 * 86_400_000,
  ).toISOString();
  const [dueRes, upcomingRes, totalRes, lapsesRes] = await Promise.all([
    client
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .lte("next_due_at", cutoffIso),
    client
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gt("next_due_at", cutoffIso)
      .lte("next_due_at", sevenDays),
    client
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", userId),
    client
      .from("user_problem_srs")
      .select("lapses")
      .eq("user_id", userId),
  ]);
  const lapsesSum = (lapsesRes.data ?? []).reduce(
    (s, r) => s + (r.lapses ?? 0),
    0,
  );
  return {
    due: dueRes.count ?? 0,
    upcoming7d: upcomingRes.count ?? 0,
    total: totalRes.count ?? 0,
    lapsesSum,
  };
}
