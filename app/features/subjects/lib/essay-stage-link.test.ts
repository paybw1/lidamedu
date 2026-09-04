import { describe, expect, it } from "vitest";

import {
  joinAnalysis,
  mapAnalysisToItems,
  outlineItems,
  splitAnalysis,
} from "~/features/subjects/lib/essay-stage-link";

const OUTLINE = `Ⅰ. 논점의 정리
Ⅱ. 청구범위 해석의 법리
  1. 원칙
  2. 발명의 설명 참작
Ⅲ. 사안의 검토
Ⅳ. 결론`;

describe("outlineItems", () => {
  it("줄 단위로 항목을 만든다", () => {
    expect(outlineItems(OUTLINE)).toEqual([
      "Ⅰ. 논점의 정리",
      "Ⅱ. 청구범위 해석의 법리",
      "1. 원칙",
      "2. 발명의 설명 참작",
      "Ⅲ. 사안의 검토",
      "Ⅳ. 결론",
    ]);
  });

  it("빈 줄·글머리표·제목 기호를 걷는다", () => {
    expect(outlineItems("- 가\n\n### 나\n  \n* 다")).toEqual(["가", "나", "다"]);
  });

  it("★같은 제목이 두 번 나오면 뒤엣것을 버린다 — 제목이 저장 키다", () => {
    expect(outlineItems("Ⅰ. 결론\nⅡ. 검토\nⅠ.  결론")).toEqual([
      "Ⅰ. 결론",
      "Ⅱ. 검토",
    ]);
  });

  it("빈 목차는 빈 배열", () => {
    for (const v of [null, undefined, "", "   \n\n"]) expect(outlineItems(v)).toEqual([]);
  });

  it("항목이 지나치게 많으면 자른다", () => {
    const many = Array.from({ length: 60 }, (_, i) => `항목 ${i}`).join("\n");
    expect(outlineItems(many)).toHaveLength(40);
  });
});

describe("splitAnalysis / joinAnalysis", () => {
  it("합쳤다 나누면 그대로 돌아온다", () => {
    const entries = [
      { title: "Ⅰ. 논점의 정리", body: "쟁점은 …이다." },
      { title: "Ⅳ. 결론", body: "따라서 …\n\n두 번째 문단." },
    ];
    const md = joinAnalysis(entries);
    expect(splitAnalysis(md)).toEqual([
      { title: "Ⅰ. 논점의 정리", body: "쟁점은 …이다." },
      { title: "Ⅳ. 결론", body: "따라서 …\n\n두 번째 문단." },
    ]);
  });

  it("빈 항목은 저장하지 않는다", () => {
    const md = joinAnalysis([
      { title: "가", body: "" },
      { title: "나", body: "  " },
      { title: "다", body: "내용" },
    ]);
    expect(md).toBe("### 다\n\n내용");
  });

  it("★제목 없이 저장된 옛 기록도 읽는다 — 개편 전에 쓴 글이 사라지면 안 된다", () => {
    const old = "쟁점 세 개를 한 칸에 몰아 쓴 옛 기록.";
    expect(splitAnalysis(old)).toEqual([{ title: null, body: old }]);
  });

  it("빈 입력은 빈 배열", () => {
    for (const v of [null, undefined, "", "  \n "]) expect(splitAnalysis(v)).toEqual([]);
  });
});

describe("mapAnalysisToItems", () => {
  const items = outlineItems(OUTLINE);

  it("제목이 같은 항목에 붙인다(띄어쓰기 차이는 무시)", () => {
    const md = "### Ⅰ.논점의 정리\n\n첫째.\n\n### Ⅳ. 결론\n\n끝.";
    const { byItem, orphans } = mapAnalysisToItems(items, md);
    expect(byItem["Ⅰ. 논점의 정리"]).toBe("첫째.");
    expect(byItem["Ⅳ. 결론"]).toBe("끝.");
    expect(orphans).toEqual([]);
  });

  it("★목차에 없는 덩이는 버리지 않는다 — 목차를 고쳐도 쓴 글이 남아야 한다", () => {
    const md = "### 사라진 항목\n\n지운 목차에 쓴 글.\n\n### Ⅳ. 결론\n\n끝.";
    const { byItem, orphans } = mapAnalysisToItems(items, md);
    expect(byItem["Ⅳ. 결론"]).toBe("끝.");
    expect(orphans).toEqual([{ title: "사라진 항목", body: "지운 목차에 쓴 글." }]);
  });

  it("★개편 전 기록(제목 없음)도 잃지 않는다", () => {
    const { byItem, orphans } = mapAnalysisToItems(items, "옛 기록 전문.");
    expect(Object.keys(byItem)).toHaveLength(0);
    expect(orphans).toEqual([{ title: null, body: "옛 기록 전문." }]);
  });

  it("목차가 비어 있으면 전부 orphan", () => {
    const { orphans } = mapAnalysisToItems([], "### 가\n\n글.");
    expect(orphans).toHaveLength(1);
  });
});
