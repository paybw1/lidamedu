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

export async function getAtRiskStudents(
  cohortId: string,
): Promise<AtRiskSummary> {
  const admin = adminClient as SupabaseClient<Database>;
  void admin; // listCohortProgressSummary uses its own admin client

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
