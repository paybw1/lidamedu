// feat-2-030 — 조문 빈칸 난이도 계층(하·중·상) 순수 로직. UI·서버 공용 SSOT.
//   tier 1=하(상위 2), 2=중(상위 4), 3=상(전체). 하 ⊂ 중 ⊂ 상 (누적 마스킹 밀도).
//   랭킹 = 읽기 순(blockIndex, cumOffset, idx). answer 없는(미매핑) 빈칸은 제외.

export type BlankTier = 1 | 2 | 3;
export const BLANK_TIERS: readonly BlankTier[] = [1, 2, 3] as const;
export const TIER_LABEL: Record<BlankTier, string> = { 1: "하", 2: "중", 3: "상" };

// 각 tier 가 가리는 누적 빈칸 수(상위 N). 3(상)=전체.
const TIER_COUNT: Record<BlankTier, number> = {
  1: 2,
  2: 4,
  3: Number.POSITIVE_INFINITY,
};

export interface OrderableBlank {
  idx: number;
  answer?: string;
  blockIndex?: number;
  cumOffset?: number;
}

// 읽기 순 정렬(blockIndex → cumOffset → idx). 미매핑(answer 빈 값) 제외.
export function orderMappedBlanks<T extends OrderableBlank>(blanks: T[]): T[] {
  return blanks
    .filter((b) => (b.answer ?? "").trim().length > 0)
    .sort((a, b) => {
      const ab = a.blockIndex ?? 0;
      const bb = b.blockIndex ?? 0;
      if (ab !== bb) return ab - bb;
      const ao = a.cumOffset ?? 0;
      const bo = b.cumOffset ?? 0;
      if (ao !== bo) return ao - bo;
      return a.idx - b.idx;
    });
}

// tier 가 활성(=가림)으로 삼는 빈칸 idx 집합.
export function activeBlankIdxsForTier(
  blanks: OrderableBlank[],
  tier: BlankTier,
): Set<number> {
  const ordered = orderMappedBlanks(blanks);
  const n = TIER_COUNT[tier];
  const take = Number.isFinite(n) ? Math.min(n, ordered.length) : ordered.length;
  return new Set(ordered.slice(0, take).map((b) => b.idx));
}

// 세트의 tier 별 활성 빈칸 수(UI 표시·겹침 판정).
export function tierBlankCounts(
  blanks: OrderableBlank[],
): Record<BlankTier, number> {
  const total = orderMappedBlanks(blanks).length;
  return {
    1: Math.min(TIER_COUNT[1], total),
    2: Math.min(TIER_COUNT[2], total),
    3: total,
  };
}

// 완료된 tier 로부터 각 tier 해금 여부(하 항상, 중=하 완료, 상=중 완료).
export function tierUnlockState(
  completed: ReadonlySet<BlankTier>,
): Record<BlankTier, boolean> {
  return {
    1: true,
    2: completed.has(1),
    3: completed.has(2),
  };
}

export function nextTier(t: BlankTier): BlankTier | null {
  return t < 3 ? ((t + 1) as BlankTier) : null;
}

// tier T 통과 시, 활성 빈칸 집합이 동일한 상위 tier 들도 함께 통과 처리(빈칸 수가 적어
//   단계가 겹칠 때 자동 완료). 반환 = 함께 완료로 기록할 tier 목록(T 포함, 오름차순).
export function tiersCoveredBy(
  blanks: OrderableBlank[],
  passedTier: BlankTier,
): BlankTier[] {
  const counts = tierBlankCounts(blanks);
  const base = counts[passedTier];
  const out: BlankTier[] = [];
  for (const t of BLANK_TIERS) {
    if (t < passedTier) continue;
    // 상위 tier 라도 활성 빈칸 수가 통과 tier 와 같으면(=같은 집합, 누적이라) 함께 완료.
    if (counts[t] === base) out.push(t);
    else break;
  }
  return out;
}
