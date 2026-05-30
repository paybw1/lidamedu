// feat-2-010 SRS — 서버 측 hook + 조회 헬퍼.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  type SrsState,
  computeNextSrsState,
} from "~/features/study/lib/srs";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

/**
 * 시도 후 SRS 상태 upsert.
 * 호출처 = recordProblemAttempt. best-effort — 실패해도 attempt 자체는 성공.
 */
export async function applyProblemSrsUpdate(
  client: SupabaseClient<Database>,
  userId: string,
  problemId: string,
  isCorrect: boolean,
): Promise<void> {
  try {
    const { data: prev } = await client
      .from("user_problem_srs")
      .select("interval_days, ease, reps, lapses")
      .eq("user_id", userId)
      .eq("problem_id", problemId)
      .maybeSingle();

    const prevState: SrsState | null = prev
      ? {
          intervalDays: prev.interval_days,
          ease: Number(prev.ease),
          reps: prev.reps,
          lapses: prev.lapses,
        }
      : null;

    const next = computeNextSrsState({ prev: prevState, isCorrect });
    const now = new Date().toISOString();

    await client
      .from("user_problem_srs")
      .upsert(
        {
          user_id: userId,
          problem_id: problemId,
          next_due_at: next.nextDueAt.toISOString(),
          interval_days: next.intervalDays,
          ease: next.ease,
          last_quality: next.lastQuality,
          last_reviewed_at: now,
          lapses: next.lapses,
          reps: next.reps,
          updated_at: now,
        },
        { onConflict: "user_id,problem_id" },
      );
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
    .lte("next_due_at", new Date().toISOString())
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
  const nowIso = new Date().toISOString();
  const sevenDays = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const [dueRes, upcomingRes, totalRes, lapsesRes] = await Promise.all([
    client
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .lte("next_due_at", nowIso),
    client
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gt("next_due_at", nowIso)
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
