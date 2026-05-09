// 정답률 → 난이도 버킷. 라벨·색상 매핑. 클라이언트/서버 공용 (서버 전용 의존 없음).

export const MIN_ATTEMPTS_FOR_DIFFICULTY = 5;

export type DifficultyBucket =
  | "very_easy"
  | "easy"
  | "medium"
  | "hard"
  | "very_hard";

export interface ProblemAggregateStats {
  attempts: number;
  correctAttempts: number;
  distinctUsers: number;
  accuracyPct: number | null;
  bucket: DifficultyBucket | null;
}

export const DIFFICULTY_LABEL: Record<DifficultyBucket, string> = {
  very_easy: "매우 쉬움",
  easy: "쉬움",
  medium: "보통",
  hard: "어려움",
  very_hard: "매우 어려움",
};

export const DIFFICULTY_TONE: Record<DifficultyBucket, string> = {
  very_easy: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
  easy: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-200",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  hard: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
  very_hard: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
};

export function bucketDifficulty(accuracyPct: number): DifficultyBucket {
  if (accuracyPct >= 80) return "very_easy";
  if (accuracyPct >= 60) return "easy";
  if (accuracyPct >= 40) return "medium";
  if (accuracyPct >= 20) return "hard";
  return "very_hard";
}

export function emptyProblemAggregate(): ProblemAggregateStats {
  return {
    attempts: 0,
    correctAttempts: 0,
    distinctUsers: 0,
    accuracyPct: null,
    bucket: null,
  };
}
