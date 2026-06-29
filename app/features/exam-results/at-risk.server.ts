// feat-8-014 강사용 위험 학생 자동 분류.
// 합격자 평균 대비 본인 학습 격차 + 최근 비활성을 weighted 합산해 risk score 산출.
// 강사가 1:1 상담 우선 대상을 한눈에 식별할 수 있도록 cohort detail 에 노출.
//
// caller(loader) 가 staff 권한 검사 후 호출. 내부는 admin client 우회.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";
import { listCohortProgressSummary } from "~/features/admin/queries/student-progress.server";

import { listPasserCases } from "./analytics.server";

export interface PasserBaseline {
  problemAttemptsMean: number;
  accuracyPctMean: number;
  sampleSize: number;
}

export interface AtRiskStudent {
  profileId: string;
  name: string;
  email: string | null;
  problemsAttempted: number;
  accuracyPct: number | null;
  articlesViewed: number;
  lastActivityAt: string | null;
  daysSinceActive: number | null;
  riskScore: number; // 0~1, higher = more at risk
  riskLevel: "high" | "medium" | "low";
  reasons: string[]; // human-readable gap reasons
  // 비교 chip 용
  problemsGap: number; // 합격자 평균 - 본인 (양수 = 부족)
  accuracyGap: number | null;
}

export interface AtRiskSummary {
  baseline: PasserBaseline | null;
  students: AtRiskStudent[]; // 위험 높은 순 정렬
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
}

// 합격자 평균(분석 동의자만) — cohort 전체에 같은 baseline 적용.
// staff(cohort owner) 운영 화면 호출이라 default 는 합성 포함(시연 가능).
// 실데이터 모드를 강제하려면 excludeSynthetic:true 전달.
async function computePasserBaseline(
  opts: { excludeSynthetic?: boolean } = {},
): Promise<PasserBaseline | null> {
  const cases = await listPasserCases({
    onlyConsented: true,
    excludeSynthetic: opts.excludeSynthetic,
  });
  const consented = cases.filter((c) => c.aggregates !== null);
  if (consented.length === 0) return null;
  const attempts = consented.map((c) => c.aggregates!.totalProblemAttempts);
  const accuracies = consented
    .map((c) => c.aggregates!.accuracyPct)
    .filter((v): v is number => v !== null);
  const mean = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  return {
    problemAttemptsMean: mean(attempts),
    accuracyPctMean: mean(accuracies),
    sampleSize: consented.length,
  };
}

// risk 가중치 — 합산 0~1.
const W_ACCURACY = 0.5;
const W_PROBLEMS = 0.3;
const W_INACTIVE = 0.2;

const HIGH_THRESHOLD = 0.55;
const MEDIUM_THRESHOLD = 0.3;

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ─── feat-7-040 P2 — 개인 시계열 추세 신호 ───
// 절대 스냅샷(낮은 정답률)만으로는 "원래 못하는 학생"과 "갑자기 무너지는 학생"을
// 구분 못 한다. 정답률 급락·공부량 급감을 28일 attempts 1회 벌크로 산출해 가산한다.
// ★표본 가드: 직전 윈도우에 데이터가 충분할 때만 발화(신규·학기초 오탐 차단).
const DAY_MS = 86_400_000;
const TREND_FETCH_DAYS = 28; // 정답률 비교(최근14d vs 직전14d)를 덮는 최대 윈도우
const TREND_ACC_SPLIT_DAYS = 14; // 정답률: [−14d, now] vs [−28d, −14d]
const TREND_STUDY_RECENT_DAYS = 7; // 공부량: [−7d, now] vs [−14d, −7d]
const MIN_PRIOR_ACC_ATTEMPTS = 10; // 직전 14d 표본 가드(정답률)
const MIN_RECENT_ACC_ATTEMPTS = 5; // 최근 14d 표본 가드(정답률)
const ACC_DROP_PP = 12; // 정답률 급락 임계(%p)
const ACC_PRIOR_FLOOR = 50; // 직전 정답률 하한 — 이미 낮던 학생의 노이즈 제외
const MIN_PRIOR_STUDY_MS = 60 * 60 * 1000; // 직전주 ≥1h 공부했을 때만(공부량 급감)
const ACTIVITY_DROP_RATIO = 0.4; // 최근/직전 ≤ 0.4 = 60%+ 급감
const W_TREND_ACC = 0.2; // 추세 가산 가중(정답률 급락)
const W_TREND_ACTIVITY = 0.15; // 추세 가산 가중(공부량 급감)

interface TrendSignal {
  accReason: string | null;
  accScore: number;
  activityReason: string | null;
  activityScore: number;
}

// 멤버별 추세 신호. 28일 attempts 벌크(유일키 attempt_id 페이징) → 윈도우 버킷.
async function getCohortTrendSignals(
  admin: SupabaseClient<Database>,
  memberIds: string[],
  now: number,
): Promise<Map<string, TrendSignal>> {
  const out = new Map<string, TrendSignal>();
  if (memberIds.length === 0) return out;

  interface Bucket {
    recentAccCorrect: number;
    recentAccTotal: number;
    priorAccCorrect: number;
    priorAccTotal: number;
    recentMs: number;
    priorMs: number;
  }
  const buckets = new Map<string, Bucket>();
  for (const id of memberIds) {
    buckets.set(id, {
      recentAccCorrect: 0,
      recentAccTotal: 0,
      priorAccCorrect: 0,
      priorAccTotal: 0,
      recentMs: 0,
      priorMs: 0,
    });
  }

  const fetchCut = now - TREND_FETCH_DAYS * DAY_MS;
  const accCut = now - TREND_ACC_SPLIT_DAYS * DAY_MS; // 이상 = 최근
  const recentMsCut = now - TREND_STUDY_RECENT_DAYS * DAY_MS;
  const priorMsCut = now - 2 * TREND_STUDY_RECENT_DAYS * DAY_MS; // [−14d, −7d]

  for (let from = 0; ; from += 1000) {
    const { data } = await admin
      .from("user_problem_attempts")
      .select("attempt_id, user_id, is_correct, time_spent_ms, attempted_at")
      .in("user_id", memberIds)
      .gte("attempted_at", new Date(fetchCut).toISOString())
      .order("attempt_id", { ascending: true })
      .range(from, from + 999);
    if (!data?.length) break;
    for (const r of data) {
      const b = buckets.get(r.user_id);
      if (!b || !r.attempted_at) continue;
      const t = new Date(r.attempted_at).getTime();
      // 정답률 윈도우(최근 14d vs 직전 14d)
      if (t >= accCut) {
        b.recentAccTotal += 1;
        if (r.is_correct) b.recentAccCorrect += 1;
      } else {
        b.priorAccTotal += 1;
        if (r.is_correct) b.priorAccCorrect += 1;
      }
      // 공부량 윈도우(최근 7d vs 직전 7d)
      const ms = r.time_spent_ms ?? 0;
      if (t >= recentMsCut) b.recentMs += ms;
      else if (t >= priorMsCut) b.priorMs += ms;
    }
    if (data.length < 1000) break;
  }

  for (const id of memberIds) {
    const b = buckets.get(id)!;
    let accReason: string | null = null;
    let accScore = 0;
    let activityReason: string | null = null;
    let activityScore = 0;

    // 정답률 급락 — 직전·최근 표본 가드 + 직전 절대값 하한.
    if (
      b.priorAccTotal >= MIN_PRIOR_ACC_ATTEMPTS &&
      b.recentAccTotal >= MIN_RECENT_ACC_ATTEMPTS
    ) {
      const priorAcc = (b.priorAccCorrect / b.priorAccTotal) * 100;
      const recentAcc = (b.recentAccCorrect / b.recentAccTotal) * 100;
      const drop = priorAcc - recentAcc;
      if (priorAcc >= ACC_PRIOR_FLOOR && drop >= ACC_DROP_PP) {
        accReason = `정답률 2주새 -${Math.round(drop)}%p (${Math.round(priorAcc)}→${Math.round(recentAcc)}%)`;
        accScore = W_TREND_ACC;
      }
    }

    // 공부량 급감 — 직전주 충분히 공부했을 때만(표본 가드).
    if (b.priorMs >= MIN_PRIOR_STUDY_MS) {
      const ratio = b.recentMs / b.priorMs;
      if (ratio <= ACTIVITY_DROP_RATIO) {
        activityReason = `공부량 직전주 대비 -${Math.round((1 - ratio) * 100)}%`;
        activityScore = W_TREND_ACTIVITY;
      }
    }

    out.set(id, { accReason, accScore, activityReason, activityScore });
  }
  return out;
}

export async function getAtRiskStudents(
  cohortId: string,
): Promise<AtRiskSummary> {
  const admin = adminClient as SupabaseClient<Database>;

  const [baseline, members] = await Promise.all([
    computePasserBaseline(),
    listCohortProgressSummary(cohortId),
  ]);

  if (members.length === 0) {
    return {
      baseline,
      students: [],
      highRiskCount: 0,
      mediumRiskCount: 0,
      lowRiskCount: 0,
    };
  }

  const now = Date.now();
  // feat-7-040 P2 — 개인 시계열 추세 신호(정답률 급락·공부량 급감)를 멤버별로 가산.
  const trendSignals = await getCohortTrendSignals(
    admin,
    members.map((m) => m.profileId),
    now,
  );
  const students: AtRiskStudent[] = members.map((m) => {
    // 비활성 일수
    const daysSinceActive = m.lastActivityAt
      ? Math.floor((now - new Date(m.lastActivityAt).getTime()) / 86_400_000)
      : null;

    let problemsGap = 0;
    let accuracyGap: number | null = null;
    let score = 0;
    const reasons: string[] = [];

    if (baseline && baseline.sampleSize >= 1) {
      // 풀이 회수 격차
      if (baseline.problemAttemptsMean > 0) {
        const gap =
          (baseline.problemAttemptsMean - m.problemsAttempted) /
          baseline.problemAttemptsMean;
        problemsGap = Math.round(
          baseline.problemAttemptsMean - m.problemsAttempted,
        );
        if (gap >= 0.5) {
          reasons.push(
            `풀이 회수 부족 (-${problemsGap.toLocaleString("ko-KR")}회)`,
          );
        } else if (gap >= 0.3) {
          reasons.push(`풀이 회수 격차 -${Math.round(gap * 100)}%`);
        }
        score += clamp01(gap) * W_PROBLEMS;
      }
      // 정답률 격차
      if (m.accuracyPct !== null) {
        accuracyGap = baseline.accuracyPctMean - m.accuracyPct;
        const ratio = clamp01(accuracyGap / 100); // 0~1
        if (accuracyGap >= 15) {
          reasons.push(`정답률 -${Math.round(accuracyGap)}%p`);
        } else if (accuracyGap >= 8) {
          reasons.push(`정답률 격차 -${Math.round(accuracyGap)}%p`);
        }
        score += ratio * W_ACCURACY;
      } else {
        // 데이터 없음 — 시도 안 한 상태로 본다.
        score += W_ACCURACY * 0.5;
        reasons.push("풀이 데이터 없음");
      }
    } else {
      // baseline 없을 땐 정답률/풀이 격차 weight 를 활성도로 흡수.
      if (m.accuracyPct !== null && m.accuracyPct < 50) {
        reasons.push(`정답률 ${m.accuracyPct}% (낮음)`);
        score += 0.4;
      } else if (m.accuracyPct === null && m.problemsAttempted === 0) {
        reasons.push("풀이 데이터 없음");
        score += 0.4;
      }
    }

    // 최근 비활성
    if (daysSinceActive === null) {
      reasons.push("학습 활동 기록 없음");
      score += W_INACTIVE;
    } else if (daysSinceActive >= 21) {
      reasons.push(`${daysSinceActive}일 미접속`);
      score += W_INACTIVE;
    } else if (daysSinceActive >= 14) {
      reasons.push(`${daysSinceActive}일 미접속`);
      score += W_INACTIVE * 0.7;
    } else if (daysSinceActive >= 7) {
      reasons.push(`${daysSinceActive}일 미접속`);
      score += W_INACTIVE * 0.4;
    }

    // feat-7-040 P2 — 추세 신호 가산. reasons 앞에 prepend("무너지기 시작" 우선 노출).
    const trend = trendSignals.get(m.profileId);
    if (trend) {
      const trendReasons = [trend.accReason, trend.activityReason].filter(
        (r): r is string => r !== null,
      );
      if (trendReasons.length > 0) {
        reasons.unshift(...trendReasons);
        score += trend.accScore + trend.activityScore;
      }
    }

    const riskScore = clamp01(score);
    const riskLevel: AtRiskStudent["riskLevel"] =
      riskScore >= HIGH_THRESHOLD
        ? "high"
        : riskScore >= MEDIUM_THRESHOLD
          ? "medium"
          : "low";

    return {
      profileId: m.profileId,
      name: m.name,
      email: m.email,
      problemsAttempted: m.problemsAttempted,
      accuracyPct: m.accuracyPct,
      articlesViewed: m.articlesViewed,
      lastActivityAt: m.lastActivityAt,
      daysSinceActive,
      riskScore,
      riskLevel,
      reasons,
      problemsGap,
      accuracyGap,
    };
  });

  students.sort((a, b) => b.riskScore - a.riskScore);

  return {
    baseline,
    students,
    highRiskCount: students.filter((s) => s.riskLevel === "high").length,
    mediumRiskCount: students.filter((s) => s.riskLevel === "medium").length,
    lowRiskCount: students.filter((s) => s.riskLevel === "low").length,
  };
}
