// 합격 진단 점수 — 단순 가중평균 모델. 학생 동기부여용 지표.
// v1: 4개 구성요소 → 0~100점.
// 임계값은 한국산업인력공단 공식 합격선(`official-exam-stats.json`)을 참조.
// 차수별로 다른 임계값 사용 (1차 ~80 / 2차 ~54) — 단순 60 룰 사용 금지.
// "데이터 누적되면 정밀화" 의 첫 단계: 공식 통계로 임의값 80/60/40 을 교체.

import {
  type ExamRound,
  type PredictionThresholds,
  getDefaultPredictionThresholds,
  getRound1PredictionThresholds,
  getRound2PredictionThresholds,
} from "~/features/exam-results/pass-criteria";

export interface PassPredictInput {
  overallArticlesPct: number; // 조문 열람 %
  overallProblemsPct: number; // 문제 풀이 %
  overallAccuracyPct: number | null; // 객관식 정답률 %
  gsAveragePct: number | null; // GS(2차 모의) 평균 점수 % — null 이면 모델에서 제외
  streakDays: number; // 연속 학습 일수
  activeDaysLast14: number; // 최근 14일 중 활동 일수
  pendingAssignmentsCount: number; // 미완 과제 수
  totalAssignmentsCount: number; // 전체 과제 수
  /** 본인 응시 차수 — 임계값 분기. null 시 1차 default. */
  examRound?: ExamRound | null;
}

export type PassRating = "안정" | "가능" | "주의" | "취약";

export interface PassPrediction {
  score: number; // 0~100
  rating: PassRating;
  components: {
    study: number; // 학습량
    accuracy: number; // 객관식 정답률
    gs: number | null; // GS 평균 (null = GS 응시 기록 없음)
    activity: number; // 활성도
    completion: number; // 과제 완수율
  };
  hint: string;
  /** 사용된 임계값 출처 라벨 — UI 노출 가능. */
  basisLabel: string;
  thresholds: PredictionThresholds;
}

function rate(score: number, th: PredictionThresholds): PassRating {
  if (score >= th.safe) return "안정";
  if (score >= th.ok) return "가능";
  if (score >= th.caution) return "주의";
  return "취약";
}

function buildHint(
  rating: PassRating,
  th: PredictionThresholds,
  round: ExamRound,
): string {
  const roundLabel = round === "first" ? "1차" : "2차";
  switch (rating) {
    case "안정":
      return `${roundLabel} 실측 합격선(${th.ok}점) + 안전 마진까지 도달. 약점 영역만 보강하세요.`;
    case "가능":
      return `${roundLabel} 실측 합격선(${th.ok}점) 도달권. 안정권(${th.safe}점)까지 정답률·풀이량 추가.`;
    case "주의":
      return `${roundLabel} 실측 합격선(${th.ok}점) 미달. 약점 영역 집중 보강 필요.`;
    case "취약":
      return `과락선(${th.caution}점) 근접. 꾸준한 학습 습관부터 회복하세요.`;
  }
}

function pickThresholds(round: ExamRound | null | undefined): {
  th: PredictionThresholds;
  round: ExamRound;
} {
  if (round === "first") return { th: getRound1PredictionThresholds(), round };
  if (round === "second") return { th: getRound2PredictionThresholds(), round };
  return { th: getDefaultPredictionThresholds(), round: "first" };
}

export function predictPassScore(input: PassPredictInput): PassPrediction {
  const study = Math.round(
    (input.overallArticlesPct + input.overallProblemsPct) / 2,
  );
  const accuracy = Math.round(input.overallAccuracyPct ?? 0);
  const gs = input.gsAveragePct === null ? null : Math.round(input.gsAveragePct);
  const streakScore = Math.min(100, (input.streakDays / 14) * 100);
  const activeScore = Math.min(100, (input.activeDaysLast14 / 14) * 100);
  const activity = Math.round(streakScore * 0.5 + activeScore * 0.5);
  const completion =
    input.totalAssignmentsCount === 0
      ? 100
      : Math.round(
          ((input.totalAssignmentsCount - input.pendingAssignmentsCount) /
            input.totalAssignmentsCount) *
            100,
        );

  // 가중치: GS 있으면 5요소(학습 25 / 정답률 25 / GS 30 / 활성도 10 / 완수 10),
  //         없으면 4요소(학습 40 / 정답률 40 / 활성도 10 / 완수 10)
  let raw: number;
  if (gs !== null) {
    raw =
      study * 0.25 +
      accuracy * 0.25 +
      gs * 0.3 +
      activity * 0.1 +
      completion * 0.1;
  } else {
    raw = study * 0.4 + accuracy * 0.4 + activity * 0.1 + completion * 0.1;
  }
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const { th, round } = pickThresholds(input.examRound);
  const rating = rate(score, th);
  return {
    score,
    rating,
    components: { study, accuracy, gs, activity, completion },
    hint: buildHint(rating, th, round),
    basisLabel: th.basisLabel,
    thresholds: th,
  };
}
