// 판례 넘버링 분할기 — 문자 보존(하이라이트 정합의 전제)과 날짜 오인 가드 검증.
import { describe, expect, it } from "vitest";

import { splitCaseNumbering } from "./case-numbering";

const join = (text: string) =>
  splitCaseNumbering(text)
    .map((s) => s.text)
    .join("");

describe("splitCaseNumbering", () => {
  it("세그먼트를 이어붙이면 원문과 문자 단위로 동일하다", () => {
    const text =
      "1. 상고이유 제1점에 관하여 가. 특허권의 권리범위 확인심판은 (대법원 2011. 9. 8. 선고 2010후3356 판결 등 참조). 나. 기록에 의하면 1) 피고는 청구하였다. 2) 원심은 파악하였다.";
    expect(join(text)).toBe(text);
  });

  it("계층 마커에서 분할하고 깊이를 매긴다", () => {
    const text = "1. 판단 가. 법리 1) 사실 (1) 세부";
    const segs = splitCaseNumbering(text);
    expect(segs.map((s) => s.depth)).toEqual([0, 1, 2, 4]);
    expect(segs[1].text.startsWith("가. ")).toBe(true);
  });

  it("날짜 사슬(2011. 9. 8. 선고)은 분할하지 않는다", () => {
    const text = "원심은 대법원 2011. 9. 8. 선고 2010후3356 판결을 인용하였다.";
    const segs = splitCaseNumbering(text);
    expect(segs).toHaveLength(1);
    expect(segs[0].depth).toBeNull();
  });

  it("숫자 나열(9. 8)의 앞 숫자도 마커가 아니다", () => {
    // "1995. 12. 22." — "12."는 직전 "1995."(숫자.) 가드, "22."도 "12." 가드.
    const text = "대판 1995. 12. 22. 판결 참조. 2. 다음 쟁점";
    const segs = splitCaseNumbering(text);
    expect(segs.map((s) => s.depth)).toEqual([null, 0]);
    expect(segs[1].text.startsWith("2. 다음")).toBe(true);
  });

  it("(가)목 처럼 뒤에 공백 없는 지칭은 보존한다", () => {
    const text = "제2호 (가)목에 해당한다.";
    expect(splitCaseNumbering(text)).toHaveLength(1);
  });

  it("<u> 밑줄 구간 안의 마커 후보는 무시한다", () => {
    const text = "요지 <u>중요한 가. 부분</u> 이후 나. 다음 항목";
    const segs = splitCaseNumbering(text);
    expect(segs).toHaveLength(2);
    expect(segs[1].text.startsWith("나. ")).toBe(true);
    expect(join(text)).toBe(text);
  });

  it("문단이 마커로 시작하면 첫 세그먼트부터 깊이를 가진다", () => {
    const segs = splitCaseNumbering("가. 첫 항목 나. 둘째 항목");
    expect(segs.map((s) => s.depth)).toEqual([1, 1]);
  });
});
