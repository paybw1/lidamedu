// feat-2-027 Phase 1 — 단원(체계도 노드) 마스터리 순수 계산 (DB 비의존).
// 단계: 미착수(untouched) → 학습 중(learning) → 익숙(familiar) → 마스터(mastered).
// ★질 게이트: '마스터'는 정답률 + SRS 파지(reps, 간격 통과)로만 — 문제 수만으로는 절대 도달 불가
// (찍기·양치기 차단). 임계값은 라이브 데이터 보고 재튜닝(설계 docs/features/동기부여-게임화-설계.md §2.1).

export const MASTERY_MIN_ATTEMPTS = 5; // 표본 게이트(약점 진단 MIN_ATTEMPTS와 동일 체계)
export const MASTERY_FAMILIAR_ACC = 70; // '익숙' 정답률 % 임계
export const MASTERY_MASTERED_ACC = 85; // '마스터' 정답률 % 임계
export const MASTERY_MASTERED_MIN_REPS = 2; // '마스터' SRS 파지(간격 통과 횟수). 한 번은 운, 두 번은 진짜.

export type MasteryStage = "untouched" | "learning" | "familiar" | "mastered";

export interface NodeMasteryInput {
  /** 노드 문제 누적 시도 수 */
  attempts: number;
  /** 노드 정답률 0~100 */
  accuracyPct: number;
  /** 노드 파지 신호: 노드 문제들의 대표 SRS reps (서버에서 산출, 0 = 복습 이력 없음) */
  srsReps: number;
  /** 노드 내 overdue(밀린) SRS 항목 수 */
  overdueCount: number;
}

/**
 * 단원 마스터리 단계 판정. 순수 함수.
 * - untouched: 시도 0
 * - learning: 시도 ≥ 1 (표본·정답률 미달)
 * - familiar: 표본 충족 + 정답률 ≥ FAMILIAR (파지 미요구)
 * - mastered: 표본 + 정답률 ≥ MASTERED + SRS 파지(reps ≥ MIN_REPS) + 밀린 복습 없음
 */
export function computeNodeMastery(input: NodeMasteryInput): MasteryStage {
  const { attempts, accuracyPct, srsReps, overdueCount } = input;
  if (attempts <= 0) return "untouched";
  // 마스터: 질(정답률) + 표본 + 시간 두고 파지(SRS reps) + 밀린 복습 없음.
  if (
    attempts >= MASTERY_MIN_ATTEMPTS &&
    accuracyPct >= MASTERY_MASTERED_ACC &&
    srsReps >= MASTERY_MASTERED_MIN_REPS &&
    overdueCount === 0
  ) {
    return "mastered";
  }
  // 익숙: 정답률 + 표본 (파지는 아직 요구하지 않음).
  if (attempts >= MASTERY_MIN_ATTEMPTS && accuracyPct >= MASTERY_FAMILIAR_ACC) {
    return "familiar";
  }
  return "learning";
}

export interface MasterySummary {
  untouched: number;
  learning: number;
  familiar: number;
  mastered: number;
  /** 익숙 + 마스터 (진척한 단원) */
  progressed: number;
  /** 집계 대상 노드 총수 */
  total: number;
}

/** 단계 배열 → 카운트 요약. 순수. */
export function summarizeMastery(stages: MasteryStage[]): MasterySummary {
  const summary: MasterySummary = {
    untouched: 0,
    learning: 0,
    familiar: 0,
    mastered: 0,
    progressed: 0,
    total: stages.length,
  };
  for (const stage of stages) summary[stage] += 1;
  summary.progressed = summary.familiar + summary.mastered;
  return summary;
}
