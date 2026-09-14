// 목록 페이징 헬퍼 테스트 (feat-11-012 P7).
// ★못박는 것: 페이지를 넘길 때 **다른 조건이 떨어지지 않는다**는 것 — 13곳이 제각기
//   만들던 시절 「2페이지로 갔더니 검색어가 풀렸다」가 갈리던 지점이다.

import { describe, expect, it } from "vitest";

import {
  PAGE_SIZE,
  pageUrlMaker,
  parsePage,
  rangeOf,
  totalPagesOf,
} from "./paging";

const req = (url: string) => new Request(url);

describe("parsePage", () => {
  it("없으면 1", () => {
    expect(parsePage(req("https://x.test/list"))).toBe(1);
  });
  it("정상 값", () => {
    expect(parsePage(req("https://x.test/list?page=3"))).toBe(3);
  });
  it("이상한 값은 전부 1 — 음수·0·소수·글자", () => {
    for (const v of ["-2", "0", "1.5", "abc", ""]) {
      expect(parsePage(req(`https://x.test/list?page=${v}`))).toBe(1);
    }
  });
  it("파라미터 이름을 바꿀 수 있다(offset 쓰는 화면이 있다)", () => {
    expect(parsePage(req("https://x.test/l?p=4"), "p")).toBe(4);
  });
});

describe("rangeOf", () => {
  it("1페이지는 0부터", () => {
    expect(rangeOf(1, 20)).toEqual([0, 19]);
  });
  it("2페이지는 이어서 — ★경계가 겹치거나 새면 안 된다", () => {
    expect(rangeOf(2, 20)).toEqual([20, 39]);
    expect(rangeOf(3, 20)).toEqual([40, 59]);
  });
  it("기본 크기", () => {
    expect(rangeOf(1)).toEqual([0, PAGE_SIZE - 1]);
  });
});

describe("totalPagesOf", () => {
  it("0건도 1페이지 — 빈 목록이 0페이지가 되면 페이저가 이상해진다", () => {
    expect(totalPagesOf(0, 20)).toBe(1);
  });
  it("딱 떨어질 때와 남을 때", () => {
    expect(totalPagesOf(40, 20)).toBe(2);
    expect(totalPagesOf(41, 20)).toBe(3);
  });
});

describe("pageUrlMaker — ★다른 조건 보존", () => {
  it("검색어·탭을 지키면서 페이지만 바꾼다", () => {
    const make = pageUrlMaker("?q=특허&tab=all&page=2");
    expect(make(3)).toBe("?q=%ED%8A%B9%ED%97%88&tab=all&page=3");
  });
  it("1페이지에서는 page 를 아예 뺀다(주소가 지저분해지지 않게)", () => {
    expect(pageUrlMaker("?q=a&page=5")(1)).toBe("?q=a");
  });
  it("조건이 없으면 page 만", () => {
    expect(pageUrlMaker("")(2)).toBe("?page=2");
  });
});
