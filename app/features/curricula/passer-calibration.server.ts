// B1 seam — "합격자 학습 시퀀스 → 권장 커리큘럼 보정" 엔진의 호출 지점만 둔다.
// 1년차 실 합격자가 0이므로 구현은 하지 않는다. 내년 데이터 누적 후
// 본 모듈의 함수만 채우면 호출처 변경 없이 동작한다.
//
// 활성화 계획·입력 데이터 요건·최소 표본·산출물 정의는
// docs/roadmap/passer-calibration.md 참조.
//
// 구현 시 본 인터페이스를 깨지 않는 한, 호출처(/admin/curricula 의 신규/편집,
// /admin/cohorts/:id 의 커리큘럼 적용 화면, dashboard.WeekTrackCard) 모두 그대로.

import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

import type { CurriculumItemKind } from "./labels";

/* ── 입력 ───────────────────────────────────────────────────────────── */

export interface PasserCalibrationInput {
  /** 보정 대상 커리큘럼. */
  curriculumId: string;
  /** 대상 cohort 응시 차수 (1차/2차). 합격자 표본 매칭에 사용. */
  examRound: "first" | "second";
  /** 보정 대상 과목들 — 비어 있으면 커리큘럼 전체. */
  subjectScope?: LawSubjectSlug[];
}

/* ── 출력 ───────────────────────────────────────────────────────────── */

export interface CalibrationSuggestion {
  /** 주차 — 1-indexed. */
  weekNumber: number;
  /** 권장 항목 유형. */
  kind: CurriculumItemKind;
  /** 권장 참조 식별자 (article_id / case_id / problem_id / blank_set_id / ...). */
  refId: string;
  /** 합격자 표본 중 이 주차에 해당 항목을 학습한 비율 (0~1). */
  passerCoverage: number;
  /** 현재 커리큘럼에 이미 들어 있는지. */
  alreadyInCurriculum: boolean;
  /** 보정 근거 한 줄. */
  reason: string;
}

export interface CalibrationReport {
  /** 보정 산출에 사용된 실(비합성) 동의 합격자 표본 수. */
  sampleSize: number;
  /** 표본 부족 시 사유. */
  insufficientReason: string | null;
  /** 주차별 권장 추가 항목. 표본 부족 시 빈 배열. */
  suggestedAdditions: CalibrationSuggestion[];
  /** 주차별 권장 제거(합격자 표본에서 학습률 < 임계) 항목. */
  suggestedRemovals: CalibrationSuggestion[];
}

/* ── 엔진 ───────────────────────────────────────────────────────────── */

/**
 * 합격자 학습 시퀀스를 입력으로 커리큘럼 주차별 권장 보정안을 산출.
 *
 * **2026 (1년차) 동작**: 항상 빈 보고 + `insufficientReason="합격자 표본 부족 (1년차)"`.
 * 내년 합격자 데이터 누적 후 본 함수의 구현을 채운다.
 *
 * 향후 구현 시 입력 데이터 요건·알고리즘은
 * docs/roadmap/passer-calibration.md 참조.
 */
export async function suggestCurriculumCalibration(
  _input: PasserCalibrationInput,
): Promise<CalibrationReport> {
  return {
    sampleSize: 0,
    insufficientReason:
      "합격자 학습 데이터 누적 후 활성화 — 1년차 운영 (docs/roadmap/passer-calibration.md)",
    suggestedAdditions: [],
    suggestedRemovals: [],
  };
}
