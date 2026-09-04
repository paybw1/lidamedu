import { describe, expect, it } from "vitest";

import {
  compareArticleNumber,
  parseCandidateSort,
  sortCandidates,
} from "~/features/offline-tests/lib/candidate-sort";

describe("compareArticleNumber", () => {
  it("★문자열이 아니라 숫자로 센다 — 제2조가 제10조보다 앞", () => {
    expect(compareArticleNumber("2", "10")).toBeLessThan(0);
    expect(compareArticleNumber("10", "2")).toBeGreaterThan(0);
  });

  it("가지조문은 본조 뒤 — 29 < 29의2 < 30", () => {
    expect(compareArticleNumber("29", "29의2")).toBeLessThan(0);
    expect(compareArticleNumber("29의2", "30")).toBeLessThan(0);
    expect(compareArticleNumber("29의2", "29의10")).toBeLessThan(0);
  });

  it("★번호를 모르는 것은 뒤로 — 0 으로 치면 제1조인 척한다", () => {
    expect(compareArticleNumber(null, "1")).toBeGreaterThan(0);
    expect(compareArticleNumber("1", null)).toBeLessThan(0);
    expect(compareArticleNumber(null, undefined)).toBe(0);
  });

  it("공백·군더더기가 섞여도 읽는다", () => {
    expect(compareArticleNumber(" 29 의 2 ", "30")).toBeLessThan(0);
  });
});

describe("sortCandidates", () => {
  const rows = [
    { id: "a", importance: 1, articleNumber: "30", latestYear: 2020 },
    { id: "b", importance: 3, articleNumber: "2", latestYear: 2015 },
    { id: "c", importance: 2, articleNumber: "29의2", latestYear: 2026 },
    { id: "d", importance: 2, articleNumber: null, latestYear: null },
  ];

  it("조문 순서", () => {
    expect(sortCandidates(rows, "article").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("중요도 순", () => {
    expect(sortCandidates(rows, "importance").map((r) => r.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
  });

  it("최근 기출 연도 순 — 연도 없는 것은 뒤로", () => {
    expect(sortCandidates(rows, "year").map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const before = rows.map((r) => r.id);
    sortCandidates(rows, "article");
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("parseCandidateSort", () => {
  it("모르는 값은 기본(중요도)으로", () => {
    expect(parseCandidateSort("article")).toBe("article");
    expect(parseCandidateSort("year")).toBe("year");
    expect(parseCandidateSort("드롭테이블")).toBe("importance");
    expect(parseCandidateSort(null)).toBe("importance");
  });
});
