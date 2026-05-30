// feat-2-017 운영자 SRS 분석 — 학생별 SRS 큐 요약 (admin client).
// 본인 RLS 우회. 호출자가 staff 권한 검증 후 호출.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface StudentSrsSummary {
  // 객관식 SRS
  problemDue: number;
  problemTotal: number;
  problemLapses: number;
  // 빈칸 SRS — set 단위 집계 (별개 user_id+set_id+blank_idx 행이 set 단위로)
  blankDueSets: number;
  blankDueBlanks: number;
  blankTotalBlanks: number;
  blankLapses: number;
  // OX SRS
  oxDue: number;
  oxTotal: number;
  oxLapses: number;
  // 조문 복습 (방문 횟수 기반 passive)
  articleDue: number;
  articleVisited: number;
  // 가장 오래된 due (overdue 일수, 모든 SRS 종합).
  oldestOverdueDays: number;
}

export async function getStudentSrsSummary(
  profileId: string,
): Promise<StudentSrsSummary> {
  const admin = adminClient as SupabaseClient<Database>;
  const nowIso = new Date().toISOString();

  const [
    problemDueRes,
    problemTotalRes,
    problemLapsesRes,
    problemOldestRes,
    blankDueRes,
    blankTotalRes,
    blankLapsesRes,
    blankOldestRes,
    oxDueRes,
    oxTotalRes,
    oxLapsesRes,
    oxOldestRes,
    sessionsRes,
  ] = await Promise.all([
    admin
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso),
    admin
      .from("user_problem_srs")
      .select("problem_id", { head: true, count: "exact" })
      .eq("user_id", profileId),
    admin
      .from("user_problem_srs")
      .select("lapses")
      .eq("user_id", profileId),
    admin
      .from("user_problem_srs")
      .select("next_due_at")
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso)
      .order("next_due_at", { ascending: true })
      .limit(1),
    admin
      .from("user_blank_srs")
      .select("set_id, blank_idx")
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso),
    admin
      .from("user_blank_srs")
      .select("blank_idx", { head: true, count: "exact" })
      .eq("user_id", profileId),
    admin
      .from("user_blank_srs")
      .select("lapses")
      .eq("user_id", profileId),
    admin
      .from("user_blank_srs")
      .select("next_due_at")
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso)
      .order("next_due_at", { ascending: true })
      .limit(1),
    admin
      .from("user_ox_ref_srs")
      .select("ref_id", { head: true, count: "exact" })
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso),
    admin
      .from("user_ox_ref_srs")
      .select("ref_id", { head: true, count: "exact" })
      .eq("user_id", profileId),
    admin
      .from("user_ox_ref_srs")
      .select("lapses")
      .eq("user_id", profileId),
    admin
      .from("user_ox_ref_srs")
      .select("next_due_at")
      .eq("user_id", profileId)
      .lte("next_due_at", nowIso)
      .order("next_due_at", { ascending: true })
      .limit(1),
    // 조문 복습용 — study_sessions 의 article 방문.
    admin
      .from("study_sessions")
      .select("scope, started_at")
      .eq("user_id", profileId)
      .order("started_at", { ascending: false })
      .limit(20000),
  ]);

  const blankRows = blankDueRes.data ?? [];
  const blankDueSets = new Set(blankRows.map((r) => r.set_id));

  const problemLapses = (problemLapsesRes.data ?? []).reduce(
    (s, r) => s + (r.lapses ?? 0),
    0,
  );
  const blankLapses = (blankLapsesRes.data ?? []).reduce(
    (s, r) => s + (r.lapses ?? 0),
    0,
  );
  const oxLapses = (oxLapsesRes.data ?? []).reduce(
    (s, r) => s + (r.lapses ?? 0),
    0,
  );

  // 조문 복습 — visit_count 기반 동적 계산 (article-review.server 와 동일 로직).
  const intervalFor = (count: number): number => {
    if (count <= 1) return 7;
    if (count === 2) return 14;
    if (count === 3) return 30;
    return 60;
  };
  type Acc = { visits: number; lastIso: string };
  const byArticle = new Map<string, Acc>();
  for (const r of sessionsRes.data ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type !== "article" || !sc.target_id) continue;
    const cur = byArticle.get(sc.target_id);
    if (!cur) {
      byArticle.set(sc.target_id, { visits: 1, lastIso: r.started_at });
    } else {
      cur.visits += 1;
      if (r.started_at > cur.lastIso) cur.lastIso = r.started_at;
    }
  }
  let articleDue = 0;
  const now = Date.now();
  for (const acc of byArticle.values()) {
    const due =
      new Date(acc.lastIso).getTime() + intervalFor(acc.visits) * 86_400_000;
    if (due <= now) articleDue += 1;
  }

  // 가장 오래된 overdue (3 SRS 테이블 + 조문복습 중 가장 이른 due).
  const candidates: number[] = [];
  if (problemOldestRes.data?.[0]?.next_due_at) {
    candidates.push(new Date(problemOldestRes.data[0].next_due_at).getTime());
  }
  if (blankOldestRes.data?.[0]?.next_due_at) {
    candidates.push(new Date(blankOldestRes.data[0].next_due_at).getTime());
  }
  if (oxOldestRes.data?.[0]?.next_due_at) {
    candidates.push(new Date(oxOldestRes.data[0].next_due_at).getTime());
  }
  // 조문 복습은 동적 — byArticle 중 가장 이른 due.
  for (const acc of byArticle.values()) {
    const due =
      new Date(acc.lastIso).getTime() + intervalFor(acc.visits) * 86_400_000;
    if (due <= now) candidates.push(due);
  }
  const oldestDueMs = candidates.length > 0 ? Math.min(...candidates) : null;
  const oldestOverdueDays =
    oldestDueMs !== null ? Math.floor((now - oldestDueMs) / 86_400_000) : 0;

  return {
    problemDue: problemDueRes.count ?? 0,
    problemTotal: problemTotalRes.count ?? 0,
    problemLapses,
    blankDueSets: blankDueSets.size,
    blankDueBlanks: blankRows.length,
    blankTotalBlanks: blankTotalRes.count ?? 0,
    blankLapses,
    oxDue: oxDueRes.count ?? 0,
    oxTotal: oxTotalRes.count ?? 0,
    oxLapses,
    articleDue,
    articleVisited: byArticle.size,
    oldestOverdueDays,
  };
}
