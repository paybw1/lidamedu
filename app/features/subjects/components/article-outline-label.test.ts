import { describe, expect, it } from "vitest";

import { opensByDefault, splitOutlineLabel } from "./article-outline-label";

describe("splitOutlineLabel", () => {
  it("편·장·절·관을 배지 값과 제목으로 나눈다", () => {
    expect(splitOutlineLabel("제1편 총칙")).toEqual({
      no: "1",
      unit: "편",
      title: "총칙",
    });
    expect(splitOutlineLabel("제11장 법인")).toEqual({
      no: "11",
      unit: "장",
      title: "법인",
    });
    expect(splitOutlineLabel("제3절 부재와 실종")).toEqual({
      no: "3",
      unit: "절",
      title: "부재와 실종",
    });
    expect(splitOutlineLabel("제2관 유언의 방식")).toEqual({
      no: "2",
      unit: "관",
      title: "유언의 방식",
    });
  });

  it("가지 장은 단위 글자 뒤의 의N 까지 번호로 본다", () => {
    // ★이걸 빼면 번호가 "6" 으로 잘리고 "의2" 가 제목 앞에 남는다(특허법 제6장의2).
    expect(splitOutlineLabel("제6장의2 특허취소신청")).toEqual({
      no: "6의2",
      unit: "장",
      title: "특허취소신청",
    });
  });

  it("조문은 배지로 만들지 않는다 — 번호가 이름의 일부다", () => {
    expect(splitOutlineLabel("제5조 신의성실")).toBeNull();
    expect(splitOutlineLabel("제29조의2")).toBeNull();
  });

  it("번호 없는 목차는 그대로 둔다", () => {
    // 특허법 목차의 '국제조약'·'실용신안법' 처럼 번호가 없는 장이 실제로 있다.
    expect(splitOutlineLabel("국제조약")).toBeNull();
    expect(splitOutlineLabel("실용신안법")).toBeNull();
  });

  it("제목이 없으면 나누지 않는다", () => {
    expect(splitOutlineLabel("제1편")).toBeNull();
  });
});

describe("opensByDefault", () => {
  it("편은 펼치되 친족·상속은 접는다", () => {
    // 변리사 시험 범위 밖이라 늘 펼쳐 두면 목차만 길어진다(원장 지시 2026-09-09).
    expect(opensByDefault("제1편 총칙")).toBe(true);
    expect(opensByDefault("제2편 물권")).toBe(true);
    expect(opensByDefault("제3편 채권")).toBe(true);
    expect(opensByDefault("제4편 친족")).toBe(false);
    expect(opensByDefault("제5편 상속")).toBe(false);
  });

  it("편이 아닌 줄은 이 규칙이 건드리지 않는다", () => {
    expect(opensByDefault("제1장 통칙")).toBe(true);
    expect(opensByDefault("01 총칙/보칙")).toBe(true);
    // 상속은 편일 때만 접는다 — 같은 이름의 장이 있어도 영향 없음.
    expect(opensByDefault("제5장 상속")).toBe(true);
  });
});
