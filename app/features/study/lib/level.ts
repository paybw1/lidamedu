// feat-2-027 Phase 2 — 전체 레벨 순수 계산 (DB 비의존).
// ★마스터 단원 수 기반(XP·누적점수 아님 — 양치기 차단 일관). 단계명은 진지·담백(게임풍 배제).
// 임계는 ★실데이터 확정 보류(학기초 ~10명·마스터 0 많음 → 대부분 입문 = 정상/의도).
// 설계 docs/features/동기부여-게임화-설계.md §6(A).

export const LEVEL_NAMES = ["입문", "정진", "숙련", "정통", "통달"] as const;
// 단계 진입 마스터 단원 수(전체 5과목 합산). LEVEL_NAMES 와 길이 동일.
export const LEVEL_MASTERED_THRESHOLDS = [0, 3, 8, 15, 25] as const;

export type LevelName = (typeof LEVEL_NAMES)[number];

export interface LevelInfo {
  levelNumber: number; // 1~5
  name: LevelName;
  masteredCount: number;
  nextName: LevelName | null; // 다음 단계명(최고 단계면 null)
  nextThreshold: number | null; // 다음 단계 진입 마스터 수
  toNext: number | null; // 다음 단계까지 남은 마스터 단원 수
}

/** 마스터 단원 수 → 레벨. 순수. masteredCount 0 = "입문"(Lv.0 없이 시작한 모두 입문). */
export function computeLevel(masteredCount: number): LevelInfo {
  const count = Math.max(0, masteredCount);
  let idx = 0;
  for (let i = 0; i < LEVEL_MASTERED_THRESHOLDS.length; i += 1) {
    if (count >= LEVEL_MASTERED_THRESHOLDS[i]) idx = i;
  }
  const isMax = idx >= LEVEL_NAMES.length - 1;
  return {
    levelNumber: idx + 1,
    name: LEVEL_NAMES[idx],
    masteredCount: count,
    nextName: isMax ? null : LEVEL_NAMES[idx + 1],
    nextThreshold: isMax ? null : LEVEL_MASTERED_THRESHOLDS[idx + 1],
    toNext: isMax ? null : LEVEL_MASTERED_THRESHOLDS[idx + 1] - count,
  };
}
