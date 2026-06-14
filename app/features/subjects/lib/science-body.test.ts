// 자연과학 bodyMd 파서 검산 — <보기> 분리·연속라인 병합·단일개행 보존·표 보호.
import { describe, expect, it } from "vitest";

import { parseScienceBody, preserveSoftBreaks } from "./science-body";

describe("parseScienceBody", () => {
  it("<보기> 블록을 stem 과 ㄱㄴㄷ 항목으로 분리", () => {
    const body =
      "다음 설명이다.\n\n이에 옳은 것은?\n\n**<보기>**\nㄱ. 가나다\nㄴ. 라마바\nㄷ. 사아자";
    const { stem, bogi } = parseScienceBody(body);
    expect(stem).toContain("이에 옳은 것은?");
    expect(stem).not.toContain("보기");
    expect(bogi).toEqual(["ㄱ. 가나다", "ㄴ. 라마바", "ㄷ. 사아자"]);
  });

  it("발문 속 <보기>에서 가 아니라 자기 줄 마커(**<보기>**)에서 분리", () => {
    const body =
      "옳은 것만을 <보기>에서 고른 것은?\n\n**<보기>**\nㄱ. 가\nㄴ. 나";
    const { stem, bogi } = parseScienceBody(body);
    expect(stem).toContain("<보기>에서 고른 것은?");
    expect(bogi).toEqual(["ㄱ. 가", "ㄴ. 나"]);
  });

  it("마커 없으면 bogi 빈 배열 + stem 전체(비크래시)", () => {
    const { stem, bogi } = parseScienceBody("그냥 발문\n둘째 줄");
    expect(bogi).toEqual([]);
    expect(stem).toContain("그냥 발문");
  });

  it("줄바꿈된 연속 보기 라인은 직전 항목에 병합", () => {
    const { bogi } = parseScienceBody(
      "발문\n<보기>\nㄱ. 첫째\n이어지는 설명\nㄴ. 둘째",
    );
    expect(bogi).toEqual(["ㄱ. 첫째 이어지는 설명", "ㄴ. 둘째"]);
  });
});

describe("preserveSoftBreaks", () => {
  it("단일 개행 → 하드 브레이크, 단락(\\n\\n)은 보존", () => {
    expect(preserveSoftBreaks("a\nb")).toBe("a  \nb");
    expect(preserveSoftBreaks("a\n\nb")).toBe("a\n\nb");
  });

  it("표(|---|)가 있으면 변환하지 않음(표 파싱 보호)", () => {
    const t = "헤더\n| a | b |\n|---|---|\n| 1 | 2 |";
    expect(preserveSoftBreaks(t)).toBe(t);
  });
});
