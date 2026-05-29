// 합격 진단 점수 — 단순 가중평균 모델. 학생 동기부여용 지표.
// v1: 4개 구성요소 → 0~100점. 실제 데이터 누적되면 후속 정밀화 (회귀 / 시험 점수 보정).

export interface PassPredictInput {
  overallArticlesPct: number; // 조문 열람 %
  overallProblemsPct: number; // 문제 풀이 %
  overallAccuracyPct: number | null; // 객관식 정답률 %
  gsAveragePct: number | null; // GS(2차 모의) 평균 점수 % — null 이면 모델에서 제외
  streakDays: number; // 연속 학습 일수
  activeDaysLast14: number; // 최근 14일 중 활동 일수
  pendingAssignmentsCount: number; // 미완 과제 수
  totalAssignmentsCount: number; // 전체 과제 수
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
}

const RATING_THRESHOLDS = { safe: 80, ok: 60, caution: 40 };

function rate(score: number): PassRating {
  if (score >= RATING_THRESHOLDS.safe) return "안정";
  if (score >= RATING_THRESHOLDS.ok) return "가능";
  if (score >= RATING_THRESHOLDS.caution) return "주의";
  return "취약";
}

const RATING_HINTS: Record<PassRating, string> = {
  안정: "현재 속도 유지. 약점 영역만 보강하세요.",
  가능: "합격선 안정권 진입까지 정답률 또는 진척 추가가 필요합니다.",
  주의: "학습량 vs 정답률 중 약한 쪽을 집중 보강하세요.",
  취약: "꾸준한 학습 습관부터 회복. 마감 과제를 우선 처리.",
};

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
  const rating = rate(score);
  return {
    score,
    rating,
    components: { study, accuracy, gs, activity, completion },
    hint: RATING_HINTS[rating],
  };
}
