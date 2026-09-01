// 인용 가드 — 실재하지 않는 사건번호를 생성 단계에서 걷어내는지(CLAUDE.md #12).
//
// 회귀 대상은 전부 2026-09-01 에 실제로 겪은 오탐·누락이다:
//   · 조문 표기 "제29조의2" 의 "29의2" 가 사건번호로 잡혀 대량 오탐(블랙리스트 → 화이트리스트)
//   · 특허심판원 심판번호(2019당3367)를 판결로 오인해 전건 FAIL
//   · 번호만 지워 "(대법원  등)" 흉터가 남던 문제
import { describe, expect, it } from "vitest";

import {
  checkCitations,
  EMPTY_ALLOWED,
  extractCaseNumbers,
  scrubCitations,
  stripUnknownCitations,
} from "./citation-guard";

describe("extractCaseNumbers", () => {
  it("법원 사건번호만 뽑는다", () => {
    expect(extractCaseNumbers("대법원 2005후3284 판결")).toEqual(["2005후3284"]);
    expect(extractCaseNumbers("서울고등법원 2023나11436 판결")).toEqual([
      "2023나11436",
    ]);
  });

  it("조문 표기를 사건번호로 오인하지 않는다", () => {
    expect(extractCaseNumbers("특허법 제29조의2 제1항 제2호")).toEqual([]);
    expect(extractCaseNumbers("제30조 제1항 제1호")).toEqual([]);
  });

  it("특허심판원 심판번호는 검사 대상이 아니다", () => {
    // 심결 경위를 옮겨 적는 것은 정상 — 빼지 않으면 전부 오탐이 된다.
    expect(extractCaseNumbers("특허심판원 2019당3367 심결")).toEqual([]);
  });
});

describe("checkCitations", () => {
  const allowed = new Set(["2005후3284"]);
  const source = "이 판결은 대법원 2007후1510 판결을 인용하였다.";

  it("DB 수록분과 원문 인용분을 통과시킨다", () => {
    const r = checkCitations("2005후3284 와 2007후1510", allowed, source);
    expect(r.known.sort()).toEqual(["2005후3284", "2007후1510"]);
    expect(r.unknown).toEqual([]);
  });

  it("어디에도 없는 번호를 잡아낸다", () => {
    // 실제 지어냈던 번호.
    expect(checkCitations("대법원 2005후3352", allowed, source).unknown).toEqual([
      "2005후3352",
    ]);
  });

  it("판결문이 줄바꿈으로 번호를 벌려 놓아도 원문 대조가 된다", () => {
    const wrapped = "대법원 2007후\n1510 판결";
    expect(checkCitations("2007후1510", EMPTY_ALLOWED, wrapped).unknown).toEqual(
      [],
    );
  });
});

describe("stripUnknownCitations / scrubCitations", () => {
  it("괄호 인용은 흉터 없이 통째로 지운다", () => {
    const r = stripUnknownCitations(
      "상업적 성공은 참고자료에 그친다(대법원 2005후3352 등).",
      ["2005후3352"],
    );
    expect(r.text).toBe("상업적 성공은 참고자료에 그친다.");
    expect(r.leftover).toEqual([]);
  });

  it("문장에 박힌 인용은 지우지 않고 사람에게 넘긴다", () => {
    // 지우면 문장 구조가 깨진다 — 자동 수정 대상이 아니다.
    const r = stripUnknownCitations("대법원 2009후3919 판결에 따르면 다르다.", [
      "2009후3919",
    ]);
    expect(r.text).toBe("대법원 2009후3919 판결에 따르면 다르다.");
    expect(r.leftover).toEqual(["2009후3919"]);
  });

  it("scrubCitations 는 제거분과 잔여분을 나눠 준다", () => {
    const r = scrubCitations(
      "가(대법원 2005후3352 참조). 대법원 2015다257538 판결은 다르다.",
      EMPTY_ALLOWED,
      "",
    );
    expect(r.removed).toEqual(["2005후3352"]);
    expect(r.leftover).toEqual(["2015다257538"]);
    expect(r.text).toBe("가. 대법원 2015다257538 판결은 다르다.");
  });

  it("근거가 있으면 손대지 않는다", () => {
    const text = "대법원 2007후1510 판결 참조.";
    expect(scrubCitations(text, EMPTY_ALLOWED, text)).toEqual({
      text,
      removed: [],
      leftover: [],
    });
  });
});
