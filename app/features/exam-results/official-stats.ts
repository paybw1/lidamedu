// 공식 변리사 시험 통계 — 한국산업인력공단(큐넷) 공고 채점통계.
// 공개·익명 집계 데이터라 PII / 합성 데이터 오염 문제 없음.
//
// **중요 가드레일 (출처 JSON important_notes 발췌)**:
//   1. 집계 통계 ≠ 개별 학습 로그. 합격자 "학습 패턴" 비교(프로그램2 핵심)에는
//      사용 금지. **합격 기준 / 벤치마크** 에만 사용.
//   2. **법정 기준(floor: 과락40·평균60) ≠ 실측 합격선(target: cut_line)**.
//      실제 합격은 cut_line 으로 결정. 1차 cut_line 은 평균60보다 훨씬 높음
//      (상대 3배수 선발), 2차 cut_line 은 60보다 낮음(최소인원 보정).
//      → "60점만 받으면 합격" 으로 학생에게 메시지화 금지.
//   3. 데이터 갱신 시 본 JSON 만 교체. 신규 연도 row 추가로 자동 반영.

import stats from "./data/official-exam-stats.json";

import type { ExamRound } from "./pass-criteria";

/* ── 타입 ─────────────────────────────────────────────────────────── */

export interface Round1YearStat {
  year: number;
  round: number;
  applicants: number;
  sat: number;
  passers: number;
  pass_rate: number;
  /** 실측 합격선 (총점/평균). null = 미공개. */
  cut_line: number | null;
  top_score: number | null;
  subjects: Record<string, { avg: number; fail_rate: number }>;
}

export interface Round2YearStat {
  year: number;
  round: number;
  applicants: number;
  sat: number;
  passers: number;
  pass_rate: number;
  cut_line: number | null;
  top_score: number | null;
  required_subjects?: Record<string, { avg: number; fail_rate: number }>;
  elective_fail_rate?: number;
}

export interface OfficialExamStats {
  source: string;
  extracted_for: string;
  important_notes: string[];
  round1: {
    statutory_criteria: {
      subject_floor: number;
      average: number;
      english: string;
      subjects: string[];
      selection: string;
      operative_target_note: string;
    };
    by_year: Round1YearStat[];
  };
  round2: {
    statutory_criteria: {
      required_subject_floor: number;
      required_average: number;
      elective: {
        pass_fail: boolean;
        pass_floor: number;
        counts_toward_total: boolean;
      };
      required_subjects: string[];
      min_headcount_adjustment: string;
      operative_target_note: string;
    };
    by_year: Round2YearStat[];
    electives_overview: {
      note: string;
      by_subject: Record<
        string,
        Array<{ year: number; sat: number; passers: number; avg: number }>
      >;
    };
  };
  demographics_optional: {
    note: string;
    round1_passer_age: Record<string, Record<string, number>>;
    round2_passer_age: Record<string, Record<string, number>>;
    round2_passer_major: Record<string, Record<string, number>>;
  };
}

export const OFFICIAL_EXAM_STATS = stats as OfficialExamStats;

/* ── 헬퍼 ─────────────────────────────────────────────────────────── */

/**
 * 차수의 가장 최근 연도 통계 (cut_line 이 null 인 연도는 skip).
 * 1년차 합격자 비교 baseline 대체재로 사용.
 */
export function getLatestRoundStat(
  round: ExamRound,
): Round1YearStat | Round2YearStat | null {
  const rows =
    round === "first"
      ? OFFICIAL_EXAM_STATS.round1.by_year
      : OFFICIAL_EXAM_STATS.round2.by_year;
  const withCut = rows
    .filter((r) => r.cut_line !== null)
    .sort((a, b) => b.year - a.year);
  return withCut[0] ?? rows[rows.length - 1] ?? null;
}

/**
 * 최근 N개 연도의 cut_line 평균. 학생에게 노출할 "실측 합격선 ~X점" 라벨용.
 * cut_line null 인 연도 제외. 데이터 부족 시 null.
 */
export function getRecentCutLineAvg(
  round: ExamRound,
  recentYears = 5,
): { avg: number; sampleYears: number; minYear: number; maxYear: number } | null {
  const rows =
    round === "first"
      ? OFFICIAL_EXAM_STATS.round1.by_year
      : OFFICIAL_EXAM_STATS.round2.by_year;
  const withCut = rows
    .filter((r): r is typeof r & { cut_line: number } => r.cut_line !== null)
    .sort((a, b) => b.year - a.year)
    .slice(0, recentYears);
  if (withCut.length === 0) return null;
  const sum = withCut.reduce((s, r) => s + r.cut_line, 0);
  return {
    avg: Math.round((sum / withCut.length) * 100) / 100,
    sampleYears: withCut.length,
    minYear: Math.min(...withCut.map((r) => r.year)),
    maxYear: Math.max(...withCut.map((r) => r.year)),
  };
}

/**
 * 최근 합격률 평균 (%) — 학생 동기부여 표시용.
 * 1차 = applicants 대비 passers, 2차 = sat 대비 passers (공식 통계 기준 동일 pass_rate 필드).
 */
export function getRecentPassRateAvg(
  round: ExamRound,
  recentYears = 5,
): { avg: number; sampleYears: number } | null {
  const rows =
    round === "first"
      ? OFFICIAL_EXAM_STATS.round1.by_year
      : OFFICIAL_EXAM_STATS.round2.by_year;
  const recent = rows.sort((a, b) => b.year - a.year).slice(0, recentYears);
  if (recent.length === 0) return null;
  const sum = recent.reduce((s, r) => s + r.pass_rate, 0);
  return {
    avg: Math.round((sum / recent.length) * 100) / 100,
    sampleYears: recent.length,
  };
}

/**
 * 1차 과목별 최근 평균/과락률 — 학생 약점 단원 안내에 사용 가능.
 *   예: "자연과학개론 최근 5년 평균 과락률 28%" — 본인 정답률이 그 이하면 경고.
 */
export interface SubjectStat {
  subject: string;
  avgAcrossYears: number;
  failRateAcrossYears: number;
  sampleYears: number;
}

export function getRound1SubjectStats(recentYears = 5): SubjectStat[] {
  const rows = OFFICIAL_EXAM_STATS.round1.by_year
    .sort((a, b) => b.year - a.year)
    .slice(0, recentYears);
  const map = new Map<string, { sumAvg: number; sumFail: number; n: number }>();
  for (const row of rows) {
    for (const [subject, s] of Object.entries(row.subjects)) {
      const cur = map.get(subject) ?? { sumAvg: 0, sumFail: 0, n: 0 };
      cur.sumAvg += s.avg;
      cur.sumFail += s.fail_rate;
      cur.n += 1;
      map.set(subject, cur);
    }
  }
  return Array.from(map.entries()).map(([subject, v]) => ({
    subject,
    avgAcrossYears: Math.round((v.sumAvg / v.n) * 100) / 100,
    failRateAcrossYears: Math.round((v.sumFail / v.n) * 100) / 100,
    sampleYears: v.n,
  }));
}

/**
 * 2차 필수과목별 최근 평균/과락률 — 19년 이후 통계 row 에만 존재.
 */
export function getRound2RequiredSubjectStats(recentYears = 5): SubjectStat[] {
  const rows = OFFICIAL_EXAM_STATS.round2.by_year
    .filter((r) => r.required_subjects)
    .sort((a, b) => b.year - a.year)
    .slice(0, recentYears);
  const map = new Map<string, { sumAvg: number; sumFail: number; n: number }>();
  for (const row of rows) {
    for (const [subject, s] of Object.entries(row.required_subjects ?? {})) {
      const cur = map.get(subject) ?? { sumAvg: 0, sumFail: 0, n: 0 };
      cur.sumAvg += s.avg;
      cur.sumFail += s.fail_rate;
      cur.n += 1;
      map.set(subject, cur);
    }
  }
  return Array.from(map.entries()).map(([subject, v]) => ({
    subject,
    avgAcrossYears: Math.round((v.sumAvg / v.n) * 100) / 100,
    failRateAcrossYears: Math.round((v.sumFail / v.n) * 100) / 100,
    sampleYears: v.n,
  }));
}
