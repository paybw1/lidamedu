import { describe, expect, it } from "vitest";

import { chunkByEojeol } from "./tier-spans";

const slice = (t: string, c: { start: number; end: number }) =>
  t.slice(c.start, c.end);

describe("chunkByEojeol", () => {
  it("최대 어절 수 이하면 한 구간(앞뒤 공백 제외)", () => {
    const t = "가나 다라 마바";
    const chunks = chunkByEojeol(t, 0, t.length, 10);
    expect(chunks).toHaveLength(1);
    expect(slice(t, chunks[0])).toBe("가나 다라 마바");
  });

  it("어절이 cap 초과면 cap 개씩 분할", () => {
    // 12 어절, cap 5 → 5 + 5 + 2
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`);
    const t = words.join(" ");
    const chunks = chunkByEojeol(t, 0, t.length, 5);
    expect(chunks).toHaveLength(3);
    expect(slice(t, chunks[0])).toBe("w0 w1 w2 w3 w4");
    expect(slice(t, chunks[1])).toBe("w5 w6 w7 w8 w9");
    expect(slice(t, chunks[2])).toBe("w10 w11");
  });

  it("구간 부분범위 + 리딩/트레일링 공백 무시", () => {
    const t = "머리말  특허출원한 발명이 다른 특허출원  꼬리말";
    const start = t.indexOf("특허출원한");
    const end = t.indexOf("  꼬리말");
    const chunks = chunkByEojeol(t, start, end, 10);
    expect(chunks).toHaveLength(1);
    expect(slice(t, chunks[0])).toBe("특허출원한 발명이 다른 특허출원");
  });

  it("공백뿐이면 빈 배열", () => {
    const t = "abc     def";
    expect(chunkByEojeol(t, 3, 8, 10)).toEqual([]);
  });

  it("cap 은 최소 1 로 방어", () => {
    const t = "a b c";
    expect(chunkByEojeol(t, 0, t.length, 0)).toHaveLength(3);
  });
});
