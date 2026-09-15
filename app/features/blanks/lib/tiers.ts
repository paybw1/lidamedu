// feat-2-030 — 조문 빈칸 난이도 계층(하·중·상) 순수 로직. UI·서버 공용 SSOT.
//   tier 1=하(상위 2), 2=중(상위 4), 3=상(전체). 하 ⊂ 중 ⊂ 상 (누적 마스킹 밀도).
//   랭킹 = 읽기 순(blockIndex, cumOffset, idx). answer 없는(미매핑) 빈칸은 제외.

export type BlankTier = 1 | 2 | 3;
export const BLANK_TIERS: readonly BlankTier[] = [1, 2, 3] as const;
export const TIER_LABEL: Record<BlankTier, string> = { 1: "하", 2: "중", 3: "상" };

// 각 tier 가 가리는 단어 빈칸 수 — **현재 빈칸(전체) 기준 비례**(사용자 모델).
//   하 = ⌈전체/2⌉(절반), 중 = 전체(현재 빈칸 그대로). 최소 1. 누적(하 ⊂ 중).
//   상(tier 3)은 단어 빈칸이 아니라 "구간(구절) 빈칸"(Phase 2, span 빈칸)으로 별도 처리 —
//   여기서는 단어 기준 폴백으로 전체를 반환(구간 빈칸 미정의 조문은 상=중 자동 완료).
//   예) 전체 27 → 하 14 / 중 27, 6 → 3 / 6, 3 → 2 / 3.
export function tierTakeCount(total: number, tier: BlankTier): number {
  if (total <= 0) return 0;
  if (tier === 1) return Math.max(1, Math.ceil(total / 2));
  return total; // 중·상(단어 폴백) = 전체
}

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
//
// ★★같은 답이 여러 번 나오면 **전부 함께** 가린다. 앞에서 N 개만 끊으면 뒤에 남은 같은 말이
//   답을 그대로 알려 준다 — 실제 신고(2026-09-15, 특허법 제10조): 「지정된 ▢(이하 "심판장"이라
//   한다)」처럼 괄호 안 약칭이 노출돼 「힌트가 되어 답이 잘 보인다」. 법령은 약칭 정의
//   (「이하 "○○"이라 한다」)가 흔해서 특수 사례가 아니라 **구조적인 누출**이다.
//   그래서 tier 의 절단은 「몇 개를 가리나」가 아니라 「어떤 말을 가리나」로 읽는다.
//   하 ⊂ 중 ⊂ 상 은 그대로 유지된다(앞에서부터 취하는 순서가 같기 때문).
export function activeBlankIdxsForTier(
  blanks: OrderableBlank[],
  tier: BlankTier,
): Set<number> {
  const ordered = orderMappedBlanks(blanks);
  const take = tierTakeCount(ordered.length, tier);
  const takenAnswers = new Set(
    ordered.slice(0, take).map((b) => (b.answer ?? "").trim()),
  );
  return new Set(
    ordered.filter((b) => takenAnswers.has((b.answer ?? "").trim())).map((b) => b.idx),
  );
}

// 세트의 tier 별 **실제로 가려지는** 빈칸 수(UI 표시·겹침 판정).
//   ★명목 take 수(tierTakeCount)가 아니라 activeBlankIdxsForTier 의 크기다 — 같은 답 확장
//   때문에 둘이 갈린다(제10조: 명목 7 vs 실제 11). 겹침 판정에 명목을 쓰면 하·중이 실제로
//   같은 문제가 되는 조문에서도 자동 완료가 안 걸려 학생이 같은 걸 두 번 푼다.
export function tierBlankCounts(
  blanks: OrderableBlank[],
): Record<BlankTier, number> {
  return {
    1: activeBlankIdxsForTier(blanks, 1).size,
    2: activeBlankIdxsForTier(blanks, 2).size,
    3: activeBlankIdxsForTier(blanks, 3).size,
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

// feat-2-030 S4-B — 장/편 단위 게이트 상태(서버 계산, 뷰어 소비). 세트 있는 조문 모수 기준.
export interface ChapterTierGate {
  /** 장 단위 해금(하 항상 열림, 중=장 전체 하 통과, 상=장 전체 중 통과). */
  unlocked: Record<BlankTier, boolean>;
  totalSets: number;
  tier1Sets: number; // 하 통과 세트 수
  tier2Sets: number; // 중 통과 세트 수
  chapterLabel: string | null;
}

// tier T 통과 시 함께 완료로 기록할 tier 목록(T 포함, 오름차순).
//   ★상(3)은 단어가 아니라 구간(span) 빈칸이라 하/중과 집합이 다르다 → 하·중 통과가 상을
//   자동 완료시키지 않는다. 하·중(단어 tier)끼리만, 빈칸 수가 같아 집합이 겹칠 때 자동 완료.
export function tiersCoveredBy(
  blanks: OrderableBlank[],
  passedTier: BlankTier,
): BlankTier[] {
  if (passedTier === 3) return [3];
  const counts = tierBlankCounts(blanks);
  const base = counts[passedTier];
  const out: BlankTier[] = [];
  for (const t of [1, 2] as const) {
    if (t < passedTier) continue;
    if (counts[t] === base) out.push(t);
    else break;
  }
  return out;
}
