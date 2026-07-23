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

const mk = (
  idx: number,
  answer = "정답",
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
