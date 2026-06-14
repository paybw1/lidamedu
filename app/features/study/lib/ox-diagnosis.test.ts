// feat-2-022 ⑥ — OX 진단 순수 집계부 검산 (DB 비의존, 합성 소수 표본).
// 매트릭스 교차 정확성 · 표본 게이트(N<5) · dedup(latest/all) · 미분류/기타 · 빈데이터 안전.
import { describe, expect, it } from "vitest";

import type { ProblemChoiceType } from "~/features/problems/labels";

import {
  OX_DIAGNOSIS_MIN_ATTEMPTS,
  type OxAttemptRow,
  type OxRefMeta,
  buildOxDiagnosis,
} from "./ox-diagnosis.server";

const AT = "2026-06-01T00:00:00.000Z";

function push(
  rows: OxAttemptRow[],
  problem: string,
  kind: "choice" | "box",
  id: string,
  correct: boolean,
  at: string = AT,
): void {
  rows.push({
    problem_id: problem,
    selected_choice_id: kind === "choice" ? id : null,
    selected_box_item_id: kind === "box" ? id : null,
    is_correct: correct,
    attempted_at: at,
  });
}

// 합성 표본: p1(node n1)=조문 5(2정답) + p2(node n1)=판례 3(0정답, 표본미달) + p3(node n2)=이론 6(6정답).
function sampleRows(): OxAttemptRow[] {
  const rows: OxAttemptRow[] = [];
  ["c1", "c2"].forEach((id) => push(rows, "p1", "choice", id, true));
  ["c3", "c4", "c5"].forEach((id) => push(rows, "p1", "choice", id, false));
  ["c6", "c7", "c8"].forEach((id) => push(rows, "p2", "choice", id, false));
  ["b1", "b2", "b3", "b4", "b5", "b6"].forEach((id) =>
    push(rows, "p3", "box", id, true),
  );
  return rows;
}

function sampleMeta(): OxRefMeta {
  const ctByRef = new Map<string, ProblemChoiceType | null>();
  ["c1", "c2", "c3", "c4", "c5"].forEach((id) =>
    ctByRef.set(`choice:${id}`, "statute"),
  );
  ["c6", "c7", "c8"].forEach((id) => ctByRef.set(`choice:${id}`, "precedent"));
  ["b1", "b2", "b3", "b4", "b5", "b6"].forEach((id) =>
    ctByRef.set(`box:${id}`, "theory"),
  );
  const nodeByProblem = new Map<string, string | null>([
    ["p1", "n1"],
    ["p2", "n1"],
    ["p3", "n2"],
  ]);
  const labelByNode = new Map<string, string>([
    ["n1", "단원1"],
    ["n2", "단원2"],
  ]);
  const lawCodeByNode = new Map<string, string>([
    ["n1", "patent"],
    ["n2", "patent"],
  ]);
  return { ctByRef, nodeByProblem, labelByNode, lawCodeByNode };
}

const emptyMeta: OxRefMeta = {
  ctByRef: new Map(),
  nodeByProblem: new Map(),
  labelByNode: new Map(),
  lawCodeByNode: new Map(),
};

describe("buildOxDiagnosis — totals", () => {
  it("누적 정답률/시도수 정확", () => {
    const d = buildOxDiagnosis(sampleRows(), sampleMeta());
    expect(d.totals.attempts).toBe(14);
    expect(d.totals.correct).toBe(8); // 2 + 0 + 6
    expect(d.totals.accuracyPct).toBe(57); // round(8/14*100)
    expect(d.totals.distinctRefs).toBe(14);
  });
});

describe("buildOxDiagnosis — byChoiceType (box 포함 union)", () => {
  it("조문/판례/이론 셀 + 표본 게이트", () => {
    const d = buildOxDiagnosis(sampleRows(), sampleMeta());
    const by = (t: ProblemChoiceType) =>
      d.byChoiceType.find((r) => r.choiceType === t);

    expect(by("statute")).toMatchObject({
      attempts: 5,
      correct: 2,
      accuracyPct: 40,
      belowThreshold: false,
    });
    // 판례 3건 → 표본 미달(N<5) → belowThreshold.
    expect(by("precedent")).toMatchObject({
      attempts: 3,
      belowThreshold: true,
    });
    // 이론은 box-item 으로만 들어옴 — union 으로 잡혀야 함.
    expect(by("theory")).toMatchObject({
      attempts: 6,
      correct: 6,
      accuracyPct: 100,
      belowThreshold: false,
    });
    // 정규 순서(조문→판례→이론).
    expect(d.byChoiceType.map((r) => r.choiceType)).toEqual([
      "statute",
      "precedent",
      "theory",
    ]);
  });
});

describe("buildOxDiagnosis — byNode (약점 점수 정렬)", () => {
  it("노드별 누적 + weaknessScore 내림차순", () => {
    const d = buildOxDiagnosis(sampleRows(), sampleMeta());
    const n1 = d.byNode.find((r) => r.nodeId === "n1");
    const n2 = d.byNode.find((r) => r.nodeId === "n2");
    expect(n1).toMatchObject({
      attempts: 8,
      correct: 2,
      accuracyPct: 25,
      belowThreshold: false,
      label: "단원1",
      lawCode: "patent", // deep-link 용 과목 slug
    });
    expect(n1!.weaknessScore).toBeGreaterThan(0);
    expect(n2).toMatchObject({ attempts: 6, accuracyPct: 100 });
    expect(n2!.weaknessScore).toBe(0); // 정답률 100 → 약점 0
    // 약점(n1) 이 먼저.
    expect(d.byNode[0]?.nodeId).toBe("n1");
  });
});

describe("buildOxDiagnosis — cross 매트릭스", () => {
  it("node × choiceType 셀 정확 + 미달 셀 belowThreshold", () => {
    const d = buildOxDiagnosis(sampleRows(), sampleMeta());
    const cell = (node: string, ct: ProblemChoiceType) =>
      d.cross.find((c) => c.nodeId === node && c.choiceType === ct);

    expect(cell("n1", "statute")).toMatchObject({
      attempts: 5,
      correct: 2,
      accuracyPct: 40,
      belowThreshold: false,
    });
    expect(cell("n1", "precedent")).toMatchObject({
      attempts: 3,
      belowThreshold: true, // N<5 → 단정 제외
    });
    expect(cell("n2", "theory")).toMatchObject({
      attempts: 6,
      accuracyPct: 100,
    });
    expect(d.cross).toHaveLength(3);
  });
});

describe("buildOxDiagnosis — 표본 게이트 경계", () => {
  it("N=5 는 충족, N=4 는 미달", () => {
    const mk = (n: number): OxAttemptRow[] => {
      const rows: OxAttemptRow[] = [];
      for (let i = 0; i < n; i++) push(rows, "p1", "choice", `x${i}`, true);
      return rows;
    };
    const meta: OxRefMeta = {
      ctByRef: new Map(),
      nodeByProblem: new Map([["p1", "n1"]]),
      labelByNode: new Map([["n1", "단원1"]]),
      lawCodeByNode: new Map([["n1", "patent"]]),
    };
    expect(OX_DIAGNOSIS_MIN_ATTEMPTS).toBe(5);
    expect(buildOxDiagnosis(mk(4), meta).byNode[0]?.belowThreshold).toBe(true);
    expect(buildOxDiagnosis(mk(5), meta).byNode[0]?.belowThreshold).toBe(false);
  });
});

describe("buildOxDiagnosis — dedup", () => {
  it("latest 는 ref별 최신 1회(입력 순서 무관)", () => {
    const meta: OxRefMeta = {
      ctByRef: new Map([["choice:cX", "statute"]]),
      nodeByProblem: new Map([["p1", "n1"]]),
      labelByNode: new Map([["n1", "단원1"]]),
      lawCodeByNode: new Map([["n1", "patent"]]),
    };
    // 같은 ref: 과거 오답 → 최신 정답. 입력은 과거 먼저(정렬 검증).
    const rows: OxAttemptRow[] = [];
    push(rows, "p1", "choice", "cX", false, "2026-01-01T00:00:00.000Z");
    push(rows, "p1", "choice", "cX", true, "2026-02-01T00:00:00.000Z");

    const latest = buildOxDiagnosis(rows, meta, { dedup: "latest" });
    expect(latest.totals.attempts).toBe(1);
    expect(latest.totals.correct).toBe(1); // 최신(정답) 채택

    const all = buildOxDiagnosis(rows, meta, { dedup: "all" });
    expect(all.totals.attempts).toBe(2);
    expect(all.totals.correct).toBe(1);
  });
});

describe("buildOxDiagnosis — 미분류 / 기타 / 빈데이터", () => {
  it("choice_type 없음 → 미분류, 노드 없음 → 기타", () => {
    const rows: OxAttemptRow[] = [];
    push(rows, "pX", "choice", "cZ", true); // meta 에 ct/node 없음
    const d = buildOxDiagnosis(rows, emptyMeta);
    expect(d.byChoiceType[0]?.choiceType).toBeNull(); // 미분류 버킷
    expect(d.byNode[0]?.nodeId).toBeNull();
    expect(d.byNode[0]?.label).toBe("기타");
    expect(d.byNode[0]?.lawCode).toBeNull(); // 매핑 없음 → deep-link 불가(라벨만)
  });

  it("빈 입력은 0/빈 배열, 크래시 없음", () => {
    const d = buildOxDiagnosis([], emptyMeta);
    expect(d.totals.attempts).toBe(0);
    expect(d.totals.accuracyPct).toBeNull();
    expect(d.byChoiceType).toHaveLength(0);
    expect(d.byNode).toHaveLength(0);
    expect(d.cross).toHaveLength(0);
  });
});
