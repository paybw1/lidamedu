import { describe, expect, it } from "vitest";

import { nounStem } from "./noun-blanks";

describe("nounStem", () => {
  it("격조사 벗겨 명사 추출", () => {
    expect(nounStem("소멸시효는")).toBe("소멸시효");
    expect(nounStem("기간을")).toBe("기간");
    expect(nounStem("채권자의")).toBe("채권자");
    expect(nounStem("법률에")).toBe("법률");
    expect(nounStem("미성년자가")).toBe("미성년자");
  });

  it("스택된 조사(만을·에서의)도 반복 제거", () => {
    expect(nounStem("권리만을")).toBe("권리");
    expect(nounStem("의무만을")).toBe("의무");
  });

  it("조사 없는 어절(용언·부사)은 제외", () => {
    expect(nounStem("없으면")).toBeNull();
    expect(nounStem("의한다")).toBeNull();
    expect(nounStem("하여야")).toBeNull();
    expect(nounStem("성실히")).toBeNull();
    expect(nounStem("취소할")).toBeNull();
  });

  it("스템 2자 미만·비한글·스톱워드 제외", () => {
    expect(nounStem("이")).toBeNull(); // 스템 없음
    expect(nounStem("그러나")).toBeNull(); // 그러(STOP)
    expect(nounStem("다음의")).toBeNull(); // 다음(STOP)
    expect(nounStem("abc를")).toBeNull(); // 비한글
  });
});
