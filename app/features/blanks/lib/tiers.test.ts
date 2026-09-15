import { describe, expect, it } from "vitest";

import {
  activeBlankIdxsForTier,
  nextTier,
  orderMappedBlanks,
  tierBlankCounts,
  tiersCoveredBy,
  tierUnlockState,
  type BlankTier,
} from "./tiers";

// ★기본 answer 는 idx 마다 **다르게** 둔다 — 같은 답은 단계 경계를 넘어 함께 가려지므로,
//   답을 공유시키면 "빈칸 N개짜리 세트"를 의도한 케이스가 조용히 중복 케이스로 바뀐다.
const mk = (
  idx: number,
  answer = `정답${idx}`,
  blockIndex?: number,
  cumOffset?: number,
) => ({ idx, answer, blockIndex, cumOffset });

describe("orderMappedBlanks", () => {
  it("읽기 순(blockIndex→cumOffset→idx)으로 정렬하고 미매핑은 제외", () => {
    const blanks = [
      mk(3, "c", 1, 0),
      mk(1, "", 0, 5), // 미매핑 → 제외
      mk(2, "b", 0, 10),
      mk(4, "a", 0, 2),
    ];
    expect(orderMappedBlanks(blanks).map((b) => b.idx)).toEqual([4, 2, 3]);
  });
});

describe("activeBlankIdxsForTier", () => {
  const blanks = [
    mk(0, "a", 0, 0),
    mk(1, "b", 0, 1),
    mk(2, "c", 0, 2),
    mk(3, "d", 0, 3),
    mk(4, "e", 0, 4),
    mk(5, "f", 0, 5),
  ];
  it("하=중의 절반(⌈6/2⌉=상위 3)", () => {
    expect([...activeBlankIdxsForTier(blanks, 1)].sort()).toEqual([0, 1, 2]);
  });
  it("중=전체(현재 빈칸 그대로)", () => {
    expect(activeBlankIdxsForTier(blanks, 2).size).toBe(6);
  });
  it("상=전체(단어 폴백 — 구간 빈칸은 S3b)", () => {
    expect(activeBlankIdxsForTier(blanks, 3).size).toBe(6);
  });
  it("★같은 답은 tier 경계를 넘어도 함께 가린다 — 약칭이 답을 알려주면 안 된다", () => {
    // 오류신고 2026-09-15(특허법 제10조): 「지정된 ▢(이하 "심판장"이라 한다)」처럼
    // 뒤에 남은 같은 말이 답을 그대로 알려 주었다. 법령의 약칭 정의는 흔한 형태라
    // 특수 사례가 아니라 구조적 누출이다.
    const dup = [
      mk(0, "지식재산처장", 0, 0),
      mk(1, "심판장", 0, 27),
      mk(2, "심판장", 0, 35), // 괄호 안 약칭 — 하 절단선 밖
      mk(3, "선임", 0, 60),
    ];
    const tier1 = activeBlankIdxsForTier(dup, 1); // ⌈4/2⌉ = 앞 2개
    expect(tier1.has(1)).toBe(true);
    expect(tier1.has(2)).toBe(true); // ★함께 가려져야 한다
    expect(tier1.has(3)).toBe(false); // 절단선 밖의 **다른** 답은 그대로 열려 있다
  });

  it("같은 답 확장이 하 ⊂ 중 ⊂ 상 을 깨지 않는다", () => {
    const dup = [mk(0, "가", 0, 0), mk(1, "나", 0, 1), mk(2, "가", 0, 2), mk(3, "다", 0, 3)];
    const t1 = activeBlankIdxsForTier(dup, 1);
    const t2 = activeBlankIdxsForTier(dup, 2);
    for (const i of t1) expect(t2.has(i)).toBe(true);
  });

  it("빈칸이 적으면 tier 가 자연 축소", () => {
    const few = [mk(0, "a"), mk(1, "b")];
    expect(activeBlankIdxsForTier(few, 1).size).toBe(1); // ⌈2/2⌉
    expect(activeBlankIdxsForTier(few, 2).size).toBe(2);
    expect(activeBlankIdxsForTier(few, 3).size).toBe(2);
  });
});

describe("tierBlankCounts", () => {
  it("전체가 5면 하3/중5/상5", () => {
    const b = [0, 1, 2, 3, 4].map((i) => mk(i));
    expect(tierBlankCounts(b)).toEqual({ 1: 3, 2: 5, 3: 5 });
  });
  it("전체가 3이면 하2/중3/상3", () => {
    const b = [0, 1, 2].map((i) => mk(i));
    expect(tierBlankCounts(b)).toEqual({ 1: 2, 2: 3, 3: 3 });
  });
});

describe("tierUnlockState", () => {
  it("하 항상 열림, 중=하완료, 상=중완료", () => {
    expect(tierUnlockState(new Set())).toEqual({ 1: true, 2: false, 3: false });
    expect(tierUnlockState(new Set<BlankTier>([1]))).toEqual({
      1: true,
      2: true,
      3: false,
    });
    expect(tierUnlockState(new Set<BlankTier>([1, 2]))).toEqual({
      1: true,
      2: true,
      3: true,
    });
  });
});

describe("nextTier", () => {
  it("다음 단계, 상은 null", () => {
    expect(nextTier(1)).toBe(2);
    expect(nextTier(2)).toBe(3);
    expect(nextTier(3)).toBeNull();
  });
});

describe("tiersCoveredBy", () => {
  it("상(구간)은 하·중 통과로 자동 완료되지 않는다", () => {
    const b = [0, 1, 2, 3, 4].map((i) => mk(i)); // 하3/중5
    expect(tiersCoveredBy(b, 1)).toEqual([1]);
    expect(tiersCoveredBy(b, 2)).toEqual([2]);
    expect(tiersCoveredBy(b, 3)).toEqual([3]);
  });
  it("★같은 답 확장으로 하·중이 같은 집합이 되면 하 통과가 중까지 커버", () => {
    // 답이 두 가지뿐이면 하(앞 2개)가 네 칸 전부를 가려 중과 같은 문제가 된다 —
    // 같은 걸 두 번 풀게 두지 않는다.
    const dup = [mk(0, "가"), mk(1, "나"), mk(2, "가"), mk(3, "나")];
    expect(tierBlankCounts(dup)).toMatchObject({ 1: 4, 2: 4 });
    expect(tiersCoveredBy(dup, 1)).toEqual([1, 2]);
  });
  it("하=중(작은 조문)이면 하 통과가 중까지 커버 — 단 상은 별개", () => {
    const b = [mk(0)]; // total=1 → 하1/중1
    expect(tiersCoveredBy(b, 1)).toEqual([1, 2]);
    expect(tiersCoveredBy(b, 2)).toEqual([2]);
    expect(tiersCoveredBy(b, 3)).toEqual([3]);
  });
  it("N=2면 하1/중2 — 하는 중과 별개", () => {
    const b = [0, 1].map((i) => mk(i));
    expect(tiersCoveredBy(b, 1)).toEqual([1]);
    expect(tiersCoveredBy(b, 2)).toEqual([2]);
  });
});
