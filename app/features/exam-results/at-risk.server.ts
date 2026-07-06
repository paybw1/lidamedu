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
const W_TREND_STALL = 0.15; // 추세 가산 가중(진도 정체)
const STALL_MIN_ACTIVE_DAYS = 2; // 최근 7d 접속(study_session) 일수 ≥ — "활동은 있음"
const STALL_MAX_RECENT_ATTEMPTS = 3; // 최근 7d 풀이 ≤ — "문제 진도 정체"
const STALL_MIN_PRIOR_ATTEMPTS = 10; // 직전 7d 풀이 ≥ — "원래 풀던 학생"(표본 가드)
// ─── 강의만 시청(P2) — 시청은 하는데 문제를 안 푸는 수동 학습 패턴 ───
// lecture_views(feat-7-029) 기준. 진도 정체(stall)와 겹치면 이 신호만 발화(이중 가산 방지).
const LECTURE_ONLY_MIN_VIEWS = 2; // 최근 14d 시청 강의 수 ≥ — 1회 열람 오탐 차단
const LECTURE_ONLY_MAX_ATTEMPTS = 5; // 최근 14d 풀이 ≤ — "문제는 안 푼다"
const W_LECTURE_ONLY = 0.2;

interface TrendSignal {
  accReason: string | null;
  accScore: number;
  activityReason: string | null;
  activityScore: number;
  stallReason: string | null;
  stallScore: number;
  lectureOnlyReason: string | null;
  lectureOnlyScore: number;
  /** 최근 28d 마지막 강의 시청 시각 — "미접속" 판정에 합산(강의 시청=활동). */
  lastLectureAt: string | null;
}

// ISO → KST 날짜 문자열(YYYY-MM-DD). 진도 정체의 "접속 일수" 집계용.
function kstDay(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

// 멤버별 추세 신호. 28일 attempts + 7일 study_sessions 벌크 → 윈도우 버킷.
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
    recentCount7d: number;
    priorCount7d: number;
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
      recentCount7d: 0,
      priorCount7d: 0,
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
      // 공부량·풀이수 윈도우(최근 7d vs 직전 7d)
      const ms = r.time_spent_ms ?? 0;
      if (t >= recentMsCut) {
        b.recentMs += ms;
        b.recentCount7d += 1;
      } else if (t >= priorMsCut) {
        b.priorMs += ms;
        b.priorCount7d += 1;
      }
    }
    if (data.length < 1000) break;
  }

  // 진도 정체용 — 최근 7d 접속(study_session) 일수. 윈도우가 작아 단일 조회(offset 페이징 회피).
  const activeDays = new Map<string, Set<string>>();
  for (const id of memberIds) activeDays.set(id, new Set<string>());
  {
    const { data } = await admin
      .from("study_sessions")
      .select("user_id, started_at")
      .in("user_id", memberIds)
      .gte("started_at", new Date(recentMsCut).toISOString())
      .limit(10000);
    for (const r of data ?? []) {
      const set = activeDays.get(r.user_id);
      if (set && r.started_at) set.add(kstDay(r.started_at));
    }
  }

  // 강의만 시청용 — 최근 28d lecture_views(시청 강의 수 + 마지막 시청 시각).
  const lectureRecent = new Map<string, Set<string>>(); // 최근 14d 시청 강의(item)
  const lastLecture = new Map<string, string>(); // 최근 28d 마지막 시청 시각
  {
    const { data } = await admin
      .from("lecture_views")
      .select("user_id, item_id, updated_at")
      .in("user_id", memberIds)
      .gte("updated_at", new Date(fetchCut).toISOString())
      .limit(10000);
    for (const r of data ?? []) {
      if (!r.updated_at) continue;
      const prev = lastLecture.get(r.user_id);
      if (!prev || r.updated_at > prev) lastLecture.set(r.user_id, r.updated_at);
      if (new Date(r.updated_at).getTime() >= accCut) {
        const set = lectureRecent.get(r.user_id) ?? new Set<string>();
        set.add(r.item_id);
        lectureRecent.set(r.user_id, set);
      }
    }
  }

  for (const id of memberIds) {
    const b = buckets.get(id)!;
    let accReason: string | null = null;
    let accScore = 0;
    let activityReason: string | null = null;
    let activityScore = 0;
    let stallReason: string | null = null;
    let stallScore = 0;

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

    // 강의만 시청 — 최근 14d 강의는 보는데 문제 풀이가 저조(수동 학습 패턴).
    let lectureOnlyReason: string | null = null;
    let lectureOnlyScore = 0;
    const recentLectureCount = lectureRecent.get(id)?.size ?? 0;
    if (
      recentLectureCount >= LECTURE_ONLY_MIN_VIEWS &&
      b.recentAccTotal <= LECTURE_ONLY_MAX_ATTEMPTS
    ) {
      lectureOnlyReason = `강의만 시청 (2주간 ${recentLectureCount}편, 풀이 ${b.recentAccTotal}문)`;
      lectureOnlyScore = W_LECTURE_ONLY;
    }

    // 진도 정체 — 접속(study_session)은 있으나 새 문제 풀이가 멈춤. 직전 7d 에 풀던 학생만(표본 가드).
    // 강의만 시청과 원인이 같으면(풀이 없음) 더 구체적인 그 신호만 발화.
    const recentActiveDays = activeDays.get(id)?.size ?? 0;
    if (
      lectureOnlyReason === null &&
      recentActiveDays >= STALL_MIN_ACTIVE_DAYS &&
      b.recentCount7d <= STALL_MAX_RECENT_ATTEMPTS &&
      b.priorCount7d >= STALL_MIN_PRIOR_ATTEMPTS
    ) {
      stallReason = `접속 중이나 문제 진도 정체 (최근 7일 ${b.recentCount7d}문, 직전 ${b.priorCount7d}문)`;
      stallScore = W_TREND_STALL;
    }

    out.set(id, {
      accReason,
      accScore,
      activityReason,
      activityScore,
      stallReason,
      stallScore,
      lectureOnlyReason,
      lectureOnlyScore,
      lastLectureAt: lastLecture.get(id) ?? null,
    });
  }
  return out;
}

// ─── feat-7-043 — 출결 신호 ───
// 최근 N개 회차 중 결석이 임계 이상이면 위험 사유로 가산. 오프라인 이탈은
// 온라인 지표보다 먼저 나타나는 경우가 많다(병행 종합반).
const ATTENDANCE_RECENT_SESSIONS = 4;
const ATTENDANCE_ABSENT_THRESHOLD = 2;
const W_ATTENDANCE = 0.25;

async function getRecentAbsenceSignals(
  admin: SupabaseClient<Database>,
  cohortId: string,
): Promise<Map<string, { reason: string; score: number }>> {
  const out = new Map<string, { reason: string; score: number }>();
  const { data: sessions } = await admin
    .from("cohort_class_sessions")
    .select("class_session_id")
    .eq("cohort_id", cohortId)
    .is("deleted_at", null)
    .order("held_on", { ascending: false })
    .order("session_no", { ascending: false })
    .limit(ATTENDANCE_RECENT_SESSIONS);
  const sessionIds = (sessions ?? []).map((s) => s.class_session_id);
  if (sessionIds.length === 0) return out;

  const { data: rows } = await admin
    .from("cohort_attendance")
    .select("profile_id, status")
    .in("class_session_id", sessionIds);
  const absentByUser = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.status === "absent") {
      absentByUser.set(r.profile_id, (absentByUser.get(r.profile_id) ?? 0) + 1);
    }
  }
  for (const [profileId, n] of absentByUser) {
    if (n >= ATTENDANCE_ABSENT_THRESHOLD) {
      out.set(profileId, {
        reason: `최근 수업 ${sessionIds.length}회 중 결석 ${n}회`,
        score: W_ATTENDANCE,
      });
    }
  }
  return out;
}

export async function getAtRiskStudents(
  cohortId: string,
): Promise<AtRiskSummary> {
  const admin = adminClient as SupabaseClient<Database>;

  const [baseline, members, absenceSignals] = await Promise.all([
    computePasserBaseline(),
    listCohortProgressSummary(cohortId),
    getRecentAbsenceSignals(adminClient as SupabaseClient<Database>, cohortId),
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
    const trend = trendSignals.get(m.profileId);
    // 비활성 일수 — 강의 시청(lecture_views)도 활동으로 합산.
    //   강의만 듣는 학생이 "미접속"으로 이중 감점되는 모순 방지(전용 신호가 따로 잡음).
    const lastActivityCandidates = [m.lastActivityAt, trend?.lastLectureAt]
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    const daysSinceActive =
      lastActivityCandidates.length > 0
        ? Math.floor((now - Math.max(...lastActivityCandidates)) / 86_400_000)
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
    if (trend) {
      const trendReasons = [
        trend.accReason,
        trend.activityReason,
        trend.stallReason,
        trend.lectureOnlyReason,
      ].filter((r): r is string => r !== null);
      if (trendReasons.length > 0) {
        reasons.unshift(...trendReasons);
        score +=
          trend.accScore +
          trend.activityScore +
          trend.stallScore +
          trend.lectureOnlyScore;
      }
    }

    // feat-7-043 — 출결 신호. 오프라인 이탈은 가장 이른 경고라 맨 앞에 노출.
    const absence = absenceSignals.get(m.profileId);
    if (absence) {
      reasons.unshift(absence.reason);
      score += absence.score;
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
