// feat-2-019 합격자 SRS 표본 비교 — 합격자 4종 SRS 평균 vs 본인.
// 분석 동의 + status='passed' 표본만. admin client 로 RLS 우회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

export interface SrsRowMetric {
  /** 합격자 평균 (학생당). */
  passerAvg: number;
  /** 본인 값. */
  userValue: number;
  /** delta = userValue - passerAvg. 양수 = 본인이 더 많이 보유(due 가 더 많음). */
  delta: number;
}

export interface PasserSrsBenchmark {
  sampleSize: number;          // 동의 + passed 합격자 표본 수
  hasSample: boolean;          // 표본 ≥ 3 일 때 true
  problemDue: SrsRowMetric;
  blankDueSets: SrsRowMetric;
  oxDue: SrsRowMetric;
  articleDue: SrsRowMetric;
  /** 합격자 평균 총 SRS 보유 (전체 + 일별 평균 not just due). */
  totalLapsesAvg: number;
  userTotalLapses: number;
}

const ARTICLE_INTERVALS = [7, 14, 30, 60];
function articleIntervalFor(visits: number): number {
  if (visits <= 1) return 7;
  if (visits === 2) return 14;
  if (visits === 3) return 30;
  return ARTICLE_INTERVALS[ARTICLE_INTERVALS.length - 1];
}

export async function getPasserSrsBenchmark(
  userId: string,
  opts: { excludeSynthetic?: boolean } = {},
): Promise<PasserSrsBenchmark> {
  const admin = adminClient as SupabaseClient<Database>;
  const nowIso = new Date().toISOString();
  const now = Date.now();

  // 1) 합격자 user_id 표본 — status='passed' + 분석 동의. (옵션: 합성 제외)
  const { data: passers } = await admin
    .from("exam_results")
    .select(
      "user_id, profiles!exam_results_user_id_fkey(analytics_consent_at, is_synthetic)",
    )
    .eq("status", "passed")
    .order("exam_year", { ascending: false })
    .limit(200);
  const consentedIds = new Set<string>();
  for (const p of passers ?? []) {
    if (!p.profiles?.analytics_consent_at) continue;
    if (opts.excludeSynthetic && p.profiles?.is_synthetic) continue;
    consentedIds.add(p.user_id);
  }
  const sampleIds = [...consentedIds];
  const sampleSize = sampleIds.length;

  // 본인은 표본에서 제외.
  const compareIds = sampleIds.filter((id) => id !== userId);

  // 2) 합격자 SRS bulk fetch (대상: compareIds + 본인 1개 — 한 번에 처리).
  const allIds = [...new Set([...compareIds, userId])];
  if (allIds.length === 0) {
    return emptyBenchmark(sampleSize);
  }

  const [problemRes, blankRes, oxRes, sessionsRes] = await Promise.all([
    admin
      .from("user_problem_srs")
      .select("user_id, next_due_at, lapses")
      .in("user_id", allIds)
      .limit(50000),
    admin
      .from("user_blank_srs")
      .select("user_id, set_id, next_due_at, lapses")
      .in("user_id", allIds)
      .limit(50000),
    admin
      .from("user_ox_ref_srs")
      .select("user_id, next_due_at, lapses")
      .in("user_id", allIds)
      .limit(50000),
    admin
      .from("study_sessions")
      .select("user_id, scope, started_at")
      .in("user_id", allIds)
      .order("started_at", { ascending: false })
      .limit(100000),
  ]);

  type Per = {
    problemDue: number;
    blankSets: Set<string>;
    oxDue: number;
    articleVisits: Map<string, { visits: number; lastIso: string }>;
    lapses: number;
  };
  const acc = new Map<string, Per>();
  function get(uid: string): Per {
    let p = acc.get(uid);
    if (!p) {
      p = {
        problemDue: 0,
        blankSets: new Set(),
        oxDue: 0,
        articleVisits: new Map(),
        lapses: 0,
      };
      acc.set(uid, p);
    }
    return p;
  }
  for (const r of problemRes.data ?? []) {
    const p = get(r.user_id);
    p.lapses += r.lapses ?? 0;
    if (new Date(r.next_due_at).getTime() <= now) p.problemDue += 1;
  }
  for (const r of blankRes.data ?? []) {
    const p = get(r.user_id);
    p.lapses += r.lapses ?? 0;
    if (new Date(r.next_due_at).getTime() <= now) p.blankSets.add(r.set_id);
  }
  for (const r of oxRes.data ?? []) {
    const p = get(r.user_id);
    p.lapses += r.lapses ?? 0;
    if (new Date(r.next_due_at).getTime() <= now) p.oxDue += 1;
  }
  for (const r of sessionsRes.data ?? []) {
    const sc = r.scope as { target_type?: string; target_id?: string } | null;
    if (sc?.target_type !== "article" || !sc.target_id) continue;
    const p = get(r.user_id);
    const cur = p.articleVisits.get(sc.target_id);
    if (!cur) {
      p.articleVisits.set(sc.target_id, {
        visits: 1,
        lastIso: r.started_at,
      });
    } else {
      cur.visits += 1;
      if (r.started_at > cur.lastIso) cur.lastIso = r.started_at;
    }
  }

  // 3) 학생별 due 합산 함수.
  function summary(uid: string) {
    const p = acc.get(uid);
    if (!p) {
      return {
        problemDue: 0,
        blankSets: 0,
        oxDue: 0,
        articleDue: 0,
        lapses: 0,
      };
    }
    let articleDue = 0;
    for (const v of p.articleVisits.values()) {
      const interval = articleIntervalFor(v.visits);
      const dueMs = new Date(v.lastIso).getTime() + interval * 86_400_000;
      if (dueMs <= now) articleDue += 1;
    }
    return {
      problemDue: p.problemDue,
      blankSets: p.blankSets.size,
      oxDue: p.oxDue,
      articleDue,
      lapses: p.lapses,
    };
  }

  // 4) 합격자 평균 (본인 제외).
  let pSumProblem = 0;
  let pSumBlank = 0;
  let pSumOx = 0;
  let pSumArticle = 0;
  let pSumLapses = 0;
  for (const id of compareIds) {
    const s = summary(id);
    pSumProblem += s.problemDue;
    pSumBlank += s.blankSets;
    pSumOx += s.oxDue;
    pSumArticle += s.articleDue;
    pSumLapses += s.lapses;
  }
  const n = compareIds.length || 1;
  const passerAvgProblem = pSumProblem / n;
  const passerAvgBlank = pSumBlank / n;
  const passerAvgOx = pSumOx / n;
  const passerAvgArticle = pSumArticle / n;
  const passerAvgLapses = pSumLapses / n;

  // 5) 본인.
  const me = summary(userId);

  const hasSample = compareIds.length >= 3;

  return {
    sampleSize,
    hasSample,
    problemDue: {
      passerAvg: passerAvgProblem,
      userValue: me.problemDue,
      delta: me.problemDue - passerAvgProblem,
    },
    blankDueSets: {
      passerAvg: passerAvgBlank,
      userValue: me.blankSets,
      delta: me.blankSets - passerAvgBlank,
    },
    oxDue: {
      passerAvg: passerAvgOx,
      userValue: me.oxDue,
      delta: me.oxDue - passerAvgOx,
    },
    articleDue: {
      passerAvg: passerAvgArticle,
      userValue: me.articleDue,
      delta: me.articleDue - passerAvgArticle,
    },
    totalLapsesAvg: passerAvgLapses,
    userTotalLapses: me.lapses,
  };
}

function emptyBenchmark(sampleSize: number): PasserSrsBenchmark {
  const zero: SrsRowMetric = { passerAvg: 0, userValue: 0, delta: 0 };
  return {
    sampleSize,
    hasSample: false,
    problemDue: zero,
    blankDueSets: zero,
    oxDue: zero,
    articleDue: zero,
    totalLapsesAvg: 0,
    userTotalLapses: 0,
  };
}
