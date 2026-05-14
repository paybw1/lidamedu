// feat-8-006 — 합격자 케이스 카드용 데이터 집계.
// admin 전용. service_role 우회.
// 합격자 1인당: 시험 결과 + 학습 요약(소비자 입력) + 학습 로그 집계(분석 동의자만).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import adminClient from "~/core/lib/supa-admin-client.server";

import type {
  ExamResultStatus,
  ExamRound,
  ExamVerificationStatus,
} from "./labels";

export interface PasserCase {
  resultId: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  examYear: number;
  examRound: ExamRound;
  status: ExamResultStatus;
  verificationStatus: ExamVerificationStatus;
  selfReportedTotalScore: number | null;
  selectedScienceSubject: string | null;
  studySummaryMd: string | null;
  analyticsConsentAt: string | null;
  // 학습 집계 — 동의 없으면 null
  aggregates: PasserAggregates | null;
}

export interface PasserAggregates {
  // 시험 12개월 전부터 시험일까지의 학습 로그 (대략적인 응시 직전 1년)
  totalProblemAttempts: number;
  distinctProblems: number;
  accuracyPct: number | null;
  totalStudyTimeMs: number;
  activeDays: number;
  longestStreakDays: number;
  // 과목별 풀이 수 (top 5)
  subjectTopAttempts: Array<{
    lawCode: string | null;
    attempts: number;
    correctRatio: number | null;
  }>;
  // 학습 활동 일자 범위
  firstActivityAt: string | null;
  lastActivityAt: string | null;
  // 빈칸/암기 활동
  blanksCorrect: number;
  blanksTotal: number;
  recitationComplete: number;
}

// KST midnight 의 ISO. 시험 응시 시점을 그 해 12월 31일로 보수적으로 잡음.
function examEndOfYearIso(year: number): string {
  return `${year}-12-31T23:59:59+09:00`;
}
function examStartOfPriorYearIso(year: number): string {
  return `${year - 1}-01-01T00:00:00+09:00`;
}

export interface ListPasserCasesFilter {
  year?: number | null;
  round?: ExamRound | null;
  onlyVerified?: boolean;
  onlyConsented?: boolean;
}

export async function listPasserCases(
  filter: ListPasserCasesFilter = {},
): Promise<PasserCase[]> {
  const admin = adminClient as SupabaseClient<Database>;
  let q = admin
    .from("exam_results")
    .select(
      "result_id, user_id, exam_year, exam_round, status, verification_status, self_reported_total_score, selected_science_subject, study_summary_md, profiles!exam_results_user_id_fkey(name, analytics_consent_at)",
    )
    .eq("status", "passed")
    .order("exam_year", { ascending: false })
    .order("verification_status", { ascending: true })
    .limit(200);
  if (filter.year) q = q.eq("exam_year", filter.year);
  if (filter.round) q = q.eq("exam_round", filter.round);
  if (filter.onlyVerified) q = q.eq("verification_status", "verified");
  const { data: rows, error } = await q;
  if (error) throw error;

  let list = (rows ?? []).map((r) => ({
    resultId: r.result_id,
    userId: r.user_id,
    userName: r.profiles?.name ?? "(이름없음)",
    examYear: r.exam_year,
    examRound: r.exam_round as ExamRound,
    status: r.status as ExamResultStatus,
    verificationStatus: r.verification_status as ExamVerificationStatus,
    selfReportedTotalScore:
      r.self_reported_total_score === null
        ? null
        : Number(r.self_reported_total_score),
    selectedScienceSubject: r.selected_science_subject,
    studySummaryMd: r.study_summary_md,
    analyticsConsentAt: r.profiles?.analytics_consent_at ?? null,
  }));
  if (filter.onlyConsented) {
    list = list.filter((r) => r.analyticsConsentAt !== null);
  }
  if (list.length === 0) return [];

  // 이메일 lookup
  const emailById = new Map<string, string | null>();
  try {
    const res = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!res.error) {
      for (const u of res.data.users) emailById.set(u.id, u.email ?? null);
    }
  } catch (e) {
    console.warn(
      "[listPasserCases] listUsers threw",
      e instanceof Error ? e.message : String(e),
    );
  }

  // 동의자만 집계 계산
  const consented = list.filter((r) => r.analyticsConsentAt !== null);
  const aggByResult = new Map<string, PasserAggregates>();
  await Promise.all(
    consented.map(async (r) => {
      const agg = await computeAggregates(admin, r.userId, r.examYear);
      aggByResult.set(r.resultId, agg);
    }),
  );

  return list.map((r) => ({
    resultId: r.resultId,
    userId: r.userId,
    userName: r.userName,
    userEmail: emailById.get(r.userId) ?? null,
    examYear: r.examYear,
    examRound: r.examRound,
    status: r.status,
    verificationStatus: r.verificationStatus,
    selfReportedTotalScore: r.selfReportedTotalScore,
    selectedScienceSubject: r.selectedScienceSubject,
    studySummaryMd: r.studySummaryMd,
    analyticsConsentAt: r.analyticsConsentAt,
    aggregates: aggByResult.get(r.resultId) ?? null,
  }));
}

async function computeAggregates(
  admin: SupabaseClient<Database>,
  userId: string,
  examYear: number,
): Promise<PasserAggregates> {
  const endIso = examEndOfYearIso(examYear);
  const startIso = examStartOfPriorYearIso(examYear); // 시험 전년도 1월 1일 ~ 시험 연도 12월 31일

  const [
    problemAttemptsRes,
    studySessionsRes,
    blankAttemptsRes,
    recitationRes,
  ] = await Promise.all([
    admin
      .from("user_problem_attempts")
      .select("problem_id, is_correct, time_spent_ms, attempted_at, problems(laws(law_code))")
      .eq("user_id", userId)
      .gte("attempted_at", startIso)
      .lte("attempted_at", endIso)
      .limit(20000),
    admin
      .from("study_sessions")
      .select("started_at, ended_at, duration_ms")
      .eq("user_id", userId)
      .gte("started_at", startIso)
      .lte("started_at", endIso)
      .limit(20000),
    admin
      .from("user_blank_attempts")
      .select("is_correct, attempted_at")
      .eq("user_id", userId)
      .gte("attempted_at", startIso)
      .lte("attempted_at", endIso)
      .limit(20000),
    admin
      .from("user_recitation_attempts")
      .select("is_complete, attempted_at")
      .eq("user_id", userId)
      .eq("is_complete", true)
      .gte("attempted_at", startIso)
      .lte("attempted_at", endIso)
      .limit(20000),
  ]);

  const problems = problemAttemptsRes.data ?? [];
  const sessions = studySessionsRes.data ?? [];
  const blanks = blankAttemptsRes.data ?? [];
  const recits = recitationRes.data ?? [];

  // 문제 풀이 집계
  const distinct = new Set<string>();
  let correct = 0;
  for (const r of problems) {
    distinct.add(r.problem_id);
    if (r.is_correct) correct += 1;
  }

  // 과목별 풀이
  const bySubject = new Map<string, { attempts: number; correct: number }>();
  for (const r of problems) {
    const code = r.problems?.laws?.law_code ?? null;
    const key = code ?? "(미지정)";
    const cur = bySubject.get(key) ?? { attempts: 0, correct: 0 };
    cur.attempts += 1;
    if (r.is_correct) cur.correct += 1;
    bySubject.set(key, cur);
  }
  const subjectTopAttempts = Array.from(bySubject.entries())
    .sort((a, b) => b[1].attempts - a[1].attempts)
    .slice(0, 5)
    .map(([k, v]) => ({
      lawCode: k === "(미지정)" ? null : k,
      attempts: v.attempts,
      correctRatio: v.attempts > 0 ? v.correct / v.attempts : null,
    }));

  // 학습 시간 + 활동 일자
  let totalTimeMs = 0;
  const dayKeySet = new Set<string>();
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  for (const s of sessions) {
    if (typeof s.duration_ms === "number") totalTimeMs += s.duration_ms;
    if (s.started_at) {
      const dayKey = new Date(s.started_at).toISOString().slice(0, 10);
      dayKeySet.add(dayKey);
      if (!firstAt || s.started_at < firstAt) firstAt = s.started_at;
      if (!lastAt || s.started_at > lastAt) lastAt = s.started_at;
    }
  }

  // longest streak — 활동 일자만 정렬해서 연속 측정
  const sortedDays = Array.from(dayKeySet).sort();
  let longestStreak = 0;
  let cur = 0;
  let prevTs: number | null = null;
  for (const d of sortedDays) {
    const ts = Date.parse(`${d}T00:00:00Z`);
    if (prevTs === null) {
      cur = 1;
    } else if (ts - prevTs === 86_400_000) {
      cur += 1;
    } else {
      cur = 1;
    }
    if (cur > longestStreak) longestStreak = cur;
    prevTs = ts;
  }

  // 빈칸
  let blanksCorrect = 0;
  for (const b of blanks) if (b.is_correct) blanksCorrect += 1;

  return {
    totalProblemAttempts: problems.length,
    distinctProblems: distinct.size,
    accuracyPct: problems.length > 0 ? Math.round((correct / problems.length) * 100) : null,
    totalStudyTimeMs: totalTimeMs,
    activeDays: dayKeySet.size,
    longestStreakDays: longestStreak,
    subjectTopAttempts,
    firstActivityAt: firstAt,
    lastActivityAt: lastAt,
    blanksCorrect,
    blanksTotal: blanks.length,
    recitationComplete: recits.length,
  };
}

export async function getPasserPoolStats(): Promise<{
  passerCount: number;
  verifiedPasserCount: number;
  consentedPasserCount: number;
  byYearRound: Array<{
    examYear: number;
    examRound: ExamRound;
    count: number;
    verified: number;
  }>;
}> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: rows } = await admin
    .from("exam_results")
    .select(
      "user_id, exam_year, exam_round, verification_status, profiles!exam_results_user_id_fkey(analytics_consent_at)",
    )
    .eq("status", "passed");
  const list = rows ?? [];
  const passerCount = list.length;
  const verifiedPasserCount = list.filter(
    (r) => r.verification_status === "verified",
  ).length;
  const consentedPasserCount = list.filter(
    (r) => r.profiles?.analytics_consent_at !== null,
  ).length;
  const groupMap = new Map<
    string,
    { examYear: number; examRound: ExamRound; count: number; verified: number }
  >();
  for (const r of list) {
    const key = `${r.exam_year}-${r.exam_round}`;
    const cur =
      groupMap.get(key) ??
      {
        examYear: r.exam_year,
        examRound: r.exam_round as ExamRound,
        count: 0,
        verified: 0,
      };
    cur.count += 1;
    if (r.verification_status === "verified") cur.verified += 1;
    groupMap.set(key, cur);
  }
  const byYearRound = Array.from(groupMap.values()).sort((a, b) => {
    if (a.examYear !== b.examYear) return b.examYear - a.examYear;
    return a.examRound === "first" ? -1 : 1;
  });
  return { passerCount, verifiedPasserCount, consentedPasserCount, byYearRound };
}

// ─── 합격자 통계 시각화 ───
// 분석 동의자만 표본에 포함. 동의 없는 합격자는 학습 로그 자체가 제외됨.

export interface Histogram {
  buckets: Array<{ from: number; to: number; count: number; label: string }>;
  n: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  mean: number | null;
}

export interface PasserAggregateStats {
  sampleSize: number; // 분석 동의자 합격자 수
  totalPasserCount: number; // 전체 합격자 수
  byYear: Record<number, number>; // 연도별 표본 분포
  byRound: { first: number; second: number };
  // 분포 히스토그램
  scoreHist: Histogram;
  studyTimeHist: Histogram; // 시간 단위
  accuracyHist: Histogram;
  activeDaysHist: Histogram;
  longestStreakHist: Histogram;
  problemAttemptsHist: Histogram;
  // 과목별 평균 풀이 + 평균 정답률
  subjectAverages: Array<{
    lawCode: string;
    avgAttempts: number;
    avgAccuracyPct: number | null;
    learners: number; // 그 과목 1회 이상 푼 합격자 수
  }>;
}

function pickPercentile(sorted: number[], pct: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * pct;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function buildHist(
  values: number[],
  bucketEdges: number[],
  formatLabel: (from: number, to: number) => string,
): Histogram {
  const valid = values.filter((v) => Number.isFinite(v));
  const sorted = [...valid].sort((a, b) => a - b);
  const buckets = [];
  for (let i = 0; i < bucketEdges.length - 1; i++) {
    const from = bucketEdges[i];
    const to = bucketEdges[i + 1];
    let count = 0;
    for (const v of valid) {
      if (i === bucketEdges.length - 2) {
        // 마지막 버킷은 to 포함
        if (v >= from && v <= to) count += 1;
      } else if (v >= from && v < to) {
        count += 1;
      }
    }
    buckets.push({ from, to, count, label: formatLabel(from, to) });
  }
  const mean =
    valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null;
  return {
    buckets,
    n: valid.length,
    median: pickPercentile(sorted, 0.5),
    p25: pickPercentile(sorted, 0.25),
    p75: pickPercentile(sorted, 0.75),
    mean,
  };
}

// 입력: 이미 fetch 한 PasserCase 리스트 (loader 에서 listPasserCases 호출 결과 재사용).
// 분석 동의자만 학습 로그 분포에 반영. 합격 점수 분포는 동의 여부 무관.
export function computePasserAggregateStats(
  cases: PasserCase[],
): PasserAggregateStats {
  const consented = cases.filter((c) => c.analyticsConsentAt !== null);
  const totalPasserCount = cases.length;
  const sampleSize = consented.length;
  const scores: number[] = [];
  const studyHours: number[] = [];
  const accuracies: number[] = [];
  const activeDays: number[] = [];
  const longestStreaks: number[] = [];
  const problemAttempts: number[] = [];
  const byYear: Record<number, number> = {};
  const byRound = { first: 0, second: 0 };

  // 과목별 집계
  const subjectMap = new Map<
    string,
    { attemptsTotal: number; accuracySum: number; accuracyN: number; learners: number }
  >();

  for (const c of consented) {
    byYear[c.examYear] = (byYear[c.examYear] ?? 0) + 1;
    byRound[c.examRound] += 1;
    if (c.selfReportedTotalScore !== null) scores.push(c.selfReportedTotalScore);
    if (c.aggregates) {
      studyHours.push(c.aggregates.totalStudyTimeMs / 3_600_000);
      if (c.aggregates.accuracyPct !== null) accuracies.push(c.aggregates.accuracyPct);
      activeDays.push(c.aggregates.activeDays);
      longestStreaks.push(c.aggregates.longestStreakDays);
      problemAttempts.push(c.aggregates.totalProblemAttempts);
      for (const s of c.aggregates.subjectTopAttempts) {
        if (!s.lawCode) continue;
        const cur =
          subjectMap.get(s.lawCode) ?? {
            attemptsTotal: 0,
            accuracySum: 0,
            accuracyN: 0,
            learners: 0,
          };
        cur.attemptsTotal += s.attempts;
        if (s.correctRatio !== null) {
          cur.accuracySum += s.correctRatio * 100;
          cur.accuracyN += 1;
        }
        cur.learners += 1;
        subjectMap.set(s.lawCode, cur);
      }
    }
  }

  const subjectAverages = Array.from(subjectMap.entries())
    .map(([lawCode, v]) => ({
      lawCode,
      avgAttempts: v.learners > 0 ? Math.round(v.attemptsTotal / v.learners) : 0,
      avgAccuracyPct:
        v.accuracyN > 0 ? Math.round(v.accuracySum / v.accuracyN) : null,
      learners: v.learners,
    }))
    .sort((a, b) => b.avgAttempts - a.avgAttempts);

  return {
    sampleSize,
    totalPasserCount,
    byYear,
    byRound,
    scoreHist: buildHist(
      scores,
      [0, 60, 65, 70, 75, 80, 85, 90, 100],
      (f, t) => `${f}-${t}`,
    ),
    studyTimeHist: buildHist(
      studyHours,
      [0, 100, 250, 500, 1000, 1500, 2500, 4000, 100000],
      (f, t) =>
        t >= 100000
          ? `${f}h+`
          : `${Math.round(f)}-${Math.round(t)}h`,
    ),
    accuracyHist: buildHist(
      accuracies,
      [0, 40, 50, 60, 65, 70, 75, 80, 100],
      (f, t) => `${f}-${t}%`,
    ),
    activeDaysHist: buildHist(
      activeDays,
      [0, 30, 60, 90, 120, 180, 240, 365, 1000],
      (f, t) =>
        t >= 1000
          ? `${f}일+`
          : `${f}-${t}일`,
    ),
    longestStreakHist: buildHist(
      longestStreaks,
      [0, 7, 14, 21, 30, 60, 90, 1000],
      (f, t) =>
        t >= 1000
          ? `${f}일+`
          : `${f}-${t}일`,
    ),
    problemAttemptsHist: buildHist(
      problemAttempts,
      [0, 500, 1000, 2000, 4000, 7000, 10000, 100000],
      (f, t) =>
        t >= 100000
          ? `${f}+회`
          : `${f}-${t}회`,
    ),
    subjectAverages,
  };
}

// ─── Phase C: 학생 컨설팅 — 합격자 평균 대비 ───

export interface PasserBenchmarkMetric {
  user: number | null;
  passerMean: number | null;
  passerMedian: number | null;
  // 본인이 합격자 분포에서 차지하는 분위 (0~1). null = 표본 부족.
  userPercentile: number | null;
}

export interface PasserBenchmark {
  // 매칭 표본 메타
  matchYear: number;
  matchRound: ExamRound;
  sampleSize: number;
  fallbackUsed: boolean; // 다른 연도/차수로 fallback 했는지
  fallbackReason: string | null;
  // 사용자가 next_exam 을 설정했는지 (false 면 카드를 다른 형태로 노출하라고 안내)
  hasPlan: boolean;
  // 비교 지표
  studyHours: PasserBenchmarkMetric;
  problemAttempts: PasserBenchmarkMetric;
  accuracyPct: PasserBenchmarkMetric;
  activeDays: PasserBenchmarkMetric;
  longestStreak: PasserBenchmarkMetric;
}

const MIN_SAMPLE_FOR_DISTRIBUTION = 3;

function metricFromValues(
  userValue: number | null,
  passerValues: number[],
): PasserBenchmarkMetric {
  if (passerValues.length === 0) {
    return {
      user: userValue,
      passerMean: null,
      passerMedian: null,
      userPercentile: null,
    };
  }
  const sorted = [...passerValues].sort((a, b) => a - b);
  const mean = passerValues.reduce((s, v) => s + v, 0) / passerValues.length;
  const median = pickPercentile(sorted, 0.5);
  let percentile: number | null = null;
  if (userValue !== null && passerValues.length >= MIN_SAMPLE_FOR_DISTRIBUTION) {
    const idx = sorted.filter((v) => v <= userValue).length;
    percentile = idx / sorted.length;
  }
  return {
    user: userValue,
    passerMean: mean,
    passerMedian: median,
    userPercentile: percentile,
  };
}

async function computeUserMetricsAllTime(
  userId: string,
): Promise<{
  studyHours: number;
  problemAttempts: number;
  accuracyPct: number | null;
  activeDays: number;
  longestStreak: number;
}> {
  const admin = adminClient as SupabaseClient<Database>;
  const [problemsRes, sessionsRes] = await Promise.all([
    admin
      .from("user_problem_attempts")
      .select("is_correct, attempted_at")
      .eq("user_id", userId)
      .limit(30000),
    admin
      .from("study_sessions")
      .select("started_at, duration_ms")
      .eq("user_id", userId)
      .limit(30000),
  ]);
  const problems = problemsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  let correct = 0;
  for (const r of problems) if (r.is_correct) correct += 1;
  const totalTimeMs = sessions.reduce(
    (s, r) => s + (typeof r.duration_ms === "number" ? r.duration_ms : 0),
    0,
  );

  const dayKeys = new Set<string>();
  for (const s of sessions) {
    if (s.started_at) dayKeys.add(s.started_at.slice(0, 10));
  }
  const sortedDays = Array.from(dayKeys).sort();
  let longest = 0;
  let cur = 0;
  let prevTs: number | null = null;
  for (const d of sortedDays) {
    const ts = Date.parse(`${d}T00:00:00Z`);
    if (prevTs === null) cur = 1;
    else if (ts - prevTs === 86_400_000) cur += 1;
    else cur = 1;
    if (cur > longest) longest = cur;
    prevTs = ts;
  }

  return {
    studyHours: totalTimeMs / 3_600_000,
    problemAttempts: problems.length,
    accuracyPct:
      problems.length > 0 ? Math.round((correct / problems.length) * 100) : null,
    activeDays: dayKeys.size,
    longestStreak: longest,
  };
}

export async function getPasserBenchmarks(
  userId: string,
): Promise<PasserBenchmark | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: profile } = await admin
    .from("profiles")
    .select("next_exam_year, next_exam_round")
    .eq("profile_id", userId)
    .maybeSingle();

  const hasPlan =
    !!profile?.next_exam_year &&
    (profile.next_exam_round === "first" || profile.next_exam_round === "second");

  // 표본 후보 — 우선 plan 매칭, 부족하면 (year-1, same round)
  const passerCases = await listPasserCases({
    onlyConsented: true,
    round: hasPlan ? (profile!.next_exam_round as ExamRound) : null,
  });
  const consented = passerCases.filter((c) => c.aggregates !== null);
  if (consented.length === 0) return null;

  let matchYear = hasPlan ? profile!.next_exam_year! : new Date().getFullYear();
  let matchRound: ExamRound = hasPlan
    ? (profile!.next_exam_round as ExamRound)
    : "first";
  let fallbackUsed = false;
  let fallbackReason: string | null = null;

  let matched = consented.filter(
    (c) => c.examYear === matchYear && c.examRound === matchRound,
  );
  if (matched.length < MIN_SAMPLE_FOR_DISTRIBUTION) {
    // fallback: 전년도 + 같은 차수
    const fallback = consented.filter(
      (c) => c.examYear === matchYear - 1 && c.examRound === matchRound,
    );
    if (fallback.length >= MIN_SAMPLE_FOR_DISTRIBUTION) {
      matched = fallback;
      matchYear = matchYear - 1;
      fallbackUsed = true;
      fallbackReason = `${matchYear + 1}년 표본 부족 — ${matchYear}년 ${
        matchRound === "first" ? "1차" : "2차"
      } 합격자로 대체`;
    } else if (consented.length >= MIN_SAMPLE_FOR_DISTRIBUTION) {
      // 최후 fallback: 전체 동의 합격자
      matched = consented;
      fallbackUsed = true;
      fallbackReason = "연도·차수 표본 부족 — 전체 동의 합격자로 대체";
    } else {
      matched = consented; // 그래도 보여줌 (표본 N 라벨로 신뢰도 표시)
      fallbackUsed = true;
      fallbackReason = "표본 부족 — 전체 동의 합격자로 대체";
    }
  }

  const userMetrics = await computeUserMetricsAllTime(userId);

  const studyHoursValues = matched.map(
    (c) => c.aggregates!.totalStudyTimeMs / 3_600_000,
  );
  const problemAttemptsValues = matched.map(
    (c) => c.aggregates!.totalProblemAttempts,
  );
  const accuracyValues = matched
    .map((c) => c.aggregates!.accuracyPct)
    .filter((v): v is number => v !== null);
  const activeDaysValues = matched.map((c) => c.aggregates!.activeDays);
  const longestStreakValues = matched.map(
    (c) => c.aggregates!.longestStreakDays,
  );

  return {
    matchYear,
    matchRound,
    sampleSize: matched.length,
    fallbackUsed,
    fallbackReason,
    hasPlan,
    studyHours: metricFromValues(userMetrics.studyHours, studyHoursValues),
    problemAttempts: metricFromValues(
      userMetrics.problemAttempts,
      problemAttemptsValues,
    ),
    accuracyPct: metricFromValues(userMetrics.accuracyPct, accuracyValues),
    activeDays: metricFromValues(userMetrics.activeDays, activeDaysValues),
    longestStreak: metricFromValues(
      userMetrics.longestStreak,
      longestStreakValues,
    ),
  };
}

// ─── 합격자 과목(법령)별 평균 풀이/정답률 ───
// 약점 단원 카드에서 "이 단원(법령)에서 합격자는 N회 풀이 / M% 정답률" 인라인 chip 노출용.

export interface PasserLawAverage {
  lawCode: string;
  avgAttempts: number;
  avgAccuracyPct: number | null;
  learners: number;
}

export async function getPasserLawAverages(): Promise<
  Record<string, PasserLawAverage>
> {
  const cases = await listPasserCases({ onlyConsented: true });
  const map = new Map<
    string,
    { attemptsTotal: number; accuracySum: number; accuracyN: number; learners: number }
  >();
  for (const c of cases) {
    if (!c.aggregates) continue;
    for (const s of c.aggregates.subjectTopAttempts) {
      if (!s.lawCode) continue;
      const cur =
        map.get(s.lawCode) ?? {
          attemptsTotal: 0,
          accuracySum: 0,
          accuracyN: 0,
          learners: 0,
        };
      cur.attemptsTotal += s.attempts;
      if (s.correctRatio !== null) {
        cur.accuracySum += s.correctRatio * 100;
        cur.accuracyN += 1;
      }
      cur.learners += 1;
      map.set(s.lawCode, cur);
    }
  }
  const out: Record<string, PasserLawAverage> = {};
  for (const [lawCode, v] of map.entries()) {
    out[lawCode] = {
      lawCode,
      avgAttempts:
        v.learners > 0 ? Math.round(v.attemptsTotal / v.learners) : 0,
      avgAccuracyPct:
        v.accuracyN > 0 ? Math.round(v.accuracySum / v.accuracyN) : null,
      learners: v.learners,
    };
  }
  return out;
}

// ─── Phase C: 학습 곡선 12주 비교 ───
// 합격자: 응시일 기준 D-12주 ~ D-0주 주별 평균(시간/풀이수/정답률).
// 본인: next_exam_year/round 기반 응시일 추정 + 현재 D-W 주차 매핑.

const TREND_WEEKS = 12;

// 변리사 시험 응시일 근사 — 실제 일자는 매년 다르나, 합격자별 정렬을 위한 기준일.
//  1차: 2월 마지막 토요일 근사 → 2월 25일
//  2차: 7월 셋째 토요일 근사 → 7월 20일
function approximateExamDateMs(year: number, round: ExamRound): number {
  const month = round === "first" ? 1 : 6; // 0-indexed
  const day = round === "first" ? 25 : 20;
  return new Date(Date.UTC(year, month, day, 0, 0, 0)).getTime();
}

export interface WeeklyTrendPoint {
  weeksToExam: number; // -12 (12주 전) ~ 0 (응시 주)
  passerMean: number | null;
  passerN: number;
  user: number | null;
}

export interface PasserTrendData {
  sampleSize: number;
  matchYear: number;
  matchRound: ExamRound;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  hasPlan: boolean;
  userCurrentWeek: number | null; // 음수 = D-N주, 0 = 시험 주, 양수 = 시험 지남
  // 3종 시리즈
  studyHours: WeeklyTrendPoint[]; // 주별 시간 (그 주에 학습한 시간)
  problemAttempts: WeeklyTrendPoint[]; // 주별 누적 풀이 수
  accuracyPct: WeeklyTrendPoint[]; // 주별 정답률
}

interface PassDailyActivity {
  examDateMs: number;
  problemsByWeek: Map<number, { attempts: number; correct: number }>;
  studyMsByWeek: Map<number, number>;
}

async function fetchPasserActivity(
  admin: SupabaseClient<Database>,
  userId: string,
  examDateMs: number,
): Promise<PassDailyActivity> {
  const windowStartMs = examDateMs - TREND_WEEKS * 7 * 86_400_000;
  const windowEndMs = examDateMs;
  const startIso = new Date(windowStartMs).toISOString();
  const endIso = new Date(windowEndMs).toISOString();

  const [problemsRes, sessionsRes] = await Promise.all([
    admin
      .from("user_problem_attempts")
      .select("is_correct, attempted_at")
      .eq("user_id", userId)
      .gte("attempted_at", startIso)
      .lte("attempted_at", endIso)
      .limit(20000),
    admin
      .from("study_sessions")
      .select("started_at, duration_ms")
      .eq("user_id", userId)
      .gte("started_at", startIso)
      .lte("started_at", endIso)
      .limit(20000),
  ]);

  const problemsByWeek = new Map<number, { attempts: number; correct: number }>();
  for (const r of problemsRes.data ?? []) {
    const t = new Date(r.attempted_at).getTime();
    const week = Math.floor((examDateMs - t) / (7 * 86_400_000)) * -1; // 음수
    const cur =
      problemsByWeek.get(week) ?? { attempts: 0, correct: 0 };
    cur.attempts += 1;
    if (r.is_correct) cur.correct += 1;
    problemsByWeek.set(week, cur);
  }

  const studyMsByWeek = new Map<number, number>();
  for (const s of sessionsRes.data ?? []) {
    if (!s.started_at) continue;
    const t = new Date(s.started_at).getTime();
    const week = Math.floor((examDateMs - t) / (7 * 86_400_000)) * -1;
    studyMsByWeek.set(
      week,
      (studyMsByWeek.get(week) ?? 0) +
        (typeof s.duration_ms === "number" ? s.duration_ms : 0),
    );
  }
  return { examDateMs, problemsByWeek, studyMsByWeek };
}

export async function getPasserTrendData(
  userId: string,
): Promise<PasserTrendData | null> {
  const admin = adminClient as SupabaseClient<Database>;
  const { data: profile } = await admin
    .from("profiles")
    .select("next_exam_year, next_exam_round")
    .eq("profile_id", userId)
    .maybeSingle();
  const hasPlan =
    !!profile?.next_exam_year &&
    (profile.next_exam_round === "first" ||
      profile.next_exam_round === "second");

  // 표본 — Phase C 컨설팅과 동일한 fallback chain
  const candidates = await listPasserCases({ onlyConsented: true });
  if (candidates.length === 0) return null;

  let matchYear = hasPlan ? profile!.next_exam_year! : new Date().getFullYear();
  let matchRound: ExamRound = hasPlan
    ? (profile!.next_exam_round as ExamRound)
    : "first";
  let fallbackUsed = false;
  let fallbackReason: string | null = null;

  let matched = candidates.filter(
    (c) => c.examYear === matchYear && c.examRound === matchRound,
  );
  if (matched.length < 3) {
    const prev = candidates.filter(
      (c) => c.examYear === matchYear - 1 && c.examRound === matchRound,
    );
    if (prev.length >= 3) {
      matched = prev;
      matchYear = matchYear - 1;
      fallbackUsed = true;
      fallbackReason = `${matchYear + 1}년 표본 부족 — ${matchYear}년 ${
        matchRound === "first" ? "1차" : "2차"
      } 합격자로 대체`;
    } else {
      matched = candidates;
      fallbackUsed = true;
      fallbackReason = "표본 부족 — 전체 동의 합격자로 대체";
    }
  }
  if (matched.length === 0) return null;

  // 합격자별 주별 활동 fetch
  const perPasser: PassDailyActivity[] = await Promise.all(
    matched.map((c) =>
      fetchPasserActivity(
        admin,
        c.userId,
        approximateExamDateMs(c.examYear, c.examRound),
      ),
    ),
  );

  // 본인 활동 — 같은 응시일 기준(매칭 year/round)으로 정렬
  const studentExamYear = hasPlan ? profile!.next_exam_year! : matchYear;
  const studentExamRound: ExamRound = hasPlan
    ? (profile!.next_exam_round as ExamRound)
    : matchRound;
  const studentExamMs = approximateExamDateMs(
    studentExamYear,
    studentExamRound,
  );
  const userActivity = await fetchPasserActivity(admin, userId, studentExamMs);
  const userCurrentWeek = hasPlan
    ? Math.floor((studentExamMs - Date.now()) / (7 * 86_400_000)) * -1
    : null;

  // 주차별 평균 series 빌드
  const studyHours: WeeklyTrendPoint[] = [];
  const problemAttempts: WeeklyTrendPoint[] = [];
  const accuracyPct: WeeklyTrendPoint[] = [];

  for (let w = -TREND_WEEKS + 1; w <= 0; w++) {
    // 합격자 평균
    let hoursSum = 0;
    let hoursN = 0;
    let problemSum = 0;
    let problemN = 0;
    let accSum = 0;
    let accN = 0;
    for (const p of perPasser) {
      const studyMs = p.studyMsByWeek.get(w) ?? 0;
      hoursSum += studyMs / 3_600_000;
      hoursN += 1;
      const probs = p.problemsByWeek.get(w);
      if (probs) {
        problemSum += probs.attempts;
        problemN += 1;
        if (probs.attempts > 0) {
          accSum += (probs.correct / probs.attempts) * 100;
          accN += 1;
        }
      } else {
        problemSum += 0;
        problemN += 1;
      }
    }

    // 본인 — userCurrentWeek 이상인 주차(미래)는 본인 값 null
    const userVisible =
      userCurrentWeek !== null && w >= userCurrentWeek - TREND_WEEKS && w <= userCurrentWeek
        ? true
        : userCurrentWeek === null
          ? false
          : w <= userCurrentWeek; // 본인이 지나간 주차만
    const userStudyMs = userActivity.studyMsByWeek.get(w) ?? 0;
    const userProbs = userActivity.problemsByWeek.get(w);
    const userHours = userVisible ? userStudyMs / 3_600_000 : null;
    const userProblems = userVisible ? userProbs?.attempts ?? 0 : null;
    const userAcc =
      userVisible && userProbs && userProbs.attempts > 0
        ? Math.round((userProbs.correct / userProbs.attempts) * 100)
        : null;

    studyHours.push({
      weeksToExam: w,
      passerMean: hoursN > 0 ? hoursSum / hoursN : null,
      passerN: hoursN,
      user: userHours,
    });
    problemAttempts.push({
      weeksToExam: w,
      passerMean: problemN > 0 ? problemSum / problemN : null,
      passerN: problemN,
      user: userProblems,
    });
    accuracyPct.push({
      weeksToExam: w,
      passerMean: accN > 0 ? accSum / accN : null,
      passerN: accN,
      user: userAcc,
    });
  }

  return {
    sampleSize: matched.length,
    matchYear,
    matchRound,
    fallbackUsed,
    fallbackReason,
    hasPlan,
    userCurrentWeek,
    studyHours,
    problemAttempts,
    accuracyPct,
  };
}

// ─── 합격자 학습 요약 모음 (anonymized) ───

export interface PasserSummary {
  resultId: string;
  examYear: number;
  examRound: ExamRound;
  scoreBucket: string | null; // "85점대", "70-79점" 등 익명 버킷
  selectedScienceSubject: string | null;
  verified: boolean;
  summaryMd: string;
  createdAt: string;
}

function bucketScore(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 90) return "90점+";
  if (score >= 85) return "85-89점";
  if (score >= 80) return "80-84점";
  if (score >= 75) return "75-79점";
  if (score >= 70) return "70-74점";
  if (score >= 65) return "65-69점";
  if (score >= 60) return "60-64점";
  return "60점 미만";
}

export interface ListPasserSummariesFilter {
  year?: number | null;
  round?: ExamRound | null;
  scienceSubject?: string | null;
  limit?: number;
}

export async function listPasserSummaries(
  filter: ListPasserSummariesFilter = {},
): Promise<PasserSummary[]> {
  const admin = adminClient as SupabaseClient<Database>;
  let q = admin
    .from("exam_results")
    .select(
      "result_id, exam_year, exam_round, status, verification_status, self_reported_total_score, selected_science_subject, study_summary_md, created_at, profiles!exam_results_user_id_fkey(analytics_consent_at)",
    )
    .eq("status", "passed")
    .not("study_summary_md", "is", null)
    .order("exam_year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(200, filter.limit ?? 50));
  if (filter.year) q = q.eq("exam_year", filter.year);
  if (filter.round) q = q.eq("exam_round", filter.round);
  if (filter.scienceSubject)
    q = q.eq("selected_science_subject", filter.scienceSubject);
  const { data, error } = await q;
  if (error) throw error;
  const list = (data ?? []).filter(
    (r) =>
      r.profiles?.analytics_consent_at !== null &&
      (r.study_summary_md?.trim().length ?? 0) > 0,
  );
  return list.map((r) => ({
    resultId: r.result_id,
    examYear: r.exam_year,
    examRound: r.exam_round as ExamRound,
    scoreBucket: bucketScore(
      r.self_reported_total_score === null
        ? null
        : Number(r.self_reported_total_score),
    ),
    selectedScienceSubject: r.selected_science_subject,
    verified: r.verification_status === "verified",
    summaryMd: r.study_summary_md ?? "",
    createdAt: r.created_at,
  }));
}

