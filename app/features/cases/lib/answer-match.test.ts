import type { CaseDiagramBlock } from "./case-diagram";

import { describe, expect, it } from "vitest";

import {
  ACCEPT_MIN,
  PARTIAL_MIN,
  keyTerms,
  matchAnswer,
  practicable,
  scoreBlock,
  verdictOf,
} from "./answer-match";

// 실제 승인 도식에서 가져온 법리(2026-08-27).
const DOCTRINE_INFRINGE =
  "특허권자는 자기의 권리를 침해한 자 또는 침해할 우려가 있는 자에 대하여 침해의 금지 또는 예방을 청구할 수 있고, 그 청구를 할 때에는 침해행위를 조성한 물건의 폐기 등 침해 예방에 필요한 조치를 청구할 수 있다.";
const DOCTRINE_PROFIT =
  "특허법 제128조 제4항은 침해자가 그 침해행위로 인하여 얻은 이익액을 특허권자가 입은 손해액으로 추정한다고 규정하는데, 이 때 '침해자가 그 침해행위로 얻은 이익액'은 특별한 사정이 없는 이상 침해제품의 총 판매수익에서 침해제품의 제조·판매를 위하여 추가로 투입된 비용을 공제한 한계이익으로 산정된다.";

describe("keyTerms", () => {
  it("조사를 벗기고 이음말을 뺀다", () => {
    const terms = keyTerms("특허권자는 자기의 권리를 침해한 자에 대하여");
    expect(terms).toContain("특허권자");
    expect(terms).toContain("권리");
    expect(terms).not.toContain("자기"); // 이음말
    expect(terms).not.toContain("자에");
  });

  it("dropFigures 는 사건 고유의 수치를 뺀다 — 포섭 채점용", () => {
    const model = "총 판매수익은 530,448,000,000원이고 2010년경부터 판매하였다";
    expect(keyTerms(model)).toContain("530");
    expect(
      keyTerms(model, { dropFigures: true }).some((t) => /\d/.test(t)),
    ).toBe(false);
    expect(keyTerms(model, { dropFigures: true })).toContain("판매수익");
  });
});

describe("matchAnswer — 세 종류의 답이 갈라진다", () => {
  // ★이 수치가 흔들리면 임계값(0.65/0.35)을 다시 재야 한다.
  it("제대로 바꿔 쓴 답은 인정 구간", () => {
    const paraphrase =
      "특허권자는 특허권을 침해하거나 침해할 우려가 있는 자를 상대로 침해의 금지 또는 예방을 구할 수 있으며, 이때 침해행위를 조성한 물건의 폐기 등 예방에 필요한 조치도 함께 청구할 수 있다.";
    expect(
      matchAnswer(DOCTRINE_INFRINGE, paraphrase).ratio,
    ).toBeGreaterThanOrEqual(ACCEPT_MIN);

    const paraphrase2 =
      "제128조 제4항에 따라 침해자가 침해행위로 얻은 이익액은 특허권자의 손해액으로 추정되는데, 그 이익액은 특별한 사정이 없는 한 침해제품의 총 판매수익에서 제조·판매에 추가로 든 비용을 공제한 한계이익을 말한다.";
    expect(
      matchAnswer(DOCTRINE_PROFIT, paraphrase2).ratio,
    ).toBeGreaterThanOrEqual(ACCEPT_MIN);
  });

  it("일부만 쓴 답은 미흡~부분", () => {
    const partial = "특허권자는 침해금지를 청구할 수 있다.";
    expect(matchAnswer(DOCTRINE_INFRINGE, partial).ratio).toBeLessThan(
      PARTIAL_MIN,
    );
  });

  it("엉뚱한 법리는 미흡", () => {
    const wrong =
      "진보성은 통상의 기술자가 선행기술로부터 용이하게 도출할 수 있는지에 따라 판단한다.";
    expect(verdictOf(matchAnswer(DOCTRINE_INFRINGE, wrong).ratio)).toBe("weak");
  });

  it("길게 늘여 써도 감점하지 않는다 — 재현율형", () => {
    const verbose = `우선 근거조문을 보면, ${DOCTRINE_INFRINGE} 따라서 사안에서도 이러한 법리에 따라 판단하여야 한다.`;
    expect(matchAnswer(DOCTRINE_INFRINGE, verbose).ratio).toBe(1);
  });

  it("빈 답은 0", () => {
    expect(matchAnswer(DOCTRINE_INFRINGE, "").ratio).toBe(0);
  });

  it("놓친 말 목록에 조사 찌꺼기를 넣지 않는다", () => {
    const partial = "특허권자는 침해금지를 청구할 수 있다.";
    const r = matchAnswer(DOCTRINE_INFRINGE, partial);
    expect(r.missed).toContain("우려");
    for (const t of r.missed) expect(t).not.toMatch(/^..[에은는을를]$/);
    expect(r.missed.length).toBeLessThanOrEqual(8);
    expect(r.missedCount).toBeGreaterThanOrEqual(r.missed.length);
  });
});

describe("scoreBlock", () => {
  const block: CaseDiagramBlock = {
    issue: "침해금지·폐기청구에서 침해의 우려 인정 여부",
    statutes: ["특허법 제126조"],
    doctrine: { textual: DOCTRINE_INFRINGE, purpose: DOCTRINE_PROFIT },
    application: "피고가 장기간 침해하였고 침해행위를 계속하여 왔다.",
    conclusion: "침해의 우려가 인정된다.",
    comment: "",
  };

  it("★축이 어긋나도 인정한다 — 취지 칸의 내용을 문언 자리에 써도 맞은 축이 된다", () => {
    // 학생은 한 칸에 쓴다. 두 축의 내용을 순서 바꿔 이어 써도 둘 다 인정.
    const swapped = `${DOCTRINE_PROFIT}\n\n${DOCTRINE_INFRINGE}`;
    const score = scoreBlock(block, { doctrine: swapped, application: "" });
    expect(score.axes).toHaveLength(2);
    expect(score.acceptedAxes).toBe(2);
  });

  it("한 축만 썼으면 그 축만 인정된다", () => {
    const score = scoreBlock(block, {
      doctrine: DOCTRINE_INFRINGE,
      application: "",
    });
    expect(score.acceptedAxes).toBe(1);
    expect(score.axes.find((a) => a.key === "textual")?.verdict).toBe(
      "accepted",
    );
    expect(score.axes.find((a) => a.key === "purpose")?.verdict).toBe("weak");
  });

  it("포섭이 비어 있는 쟁점은 포섭을 채점하지 않는다", () => {
    const noApp: CaseDiagramBlock = { ...block, application: "" };
    expect(
      scoreBlock(noApp, { doctrine: "", application: "무엇이든" }).application,
    ).toBeNull();
  });

  it("모범답안이 아예 없는 쟁점은 연습 대상이 아니다", () => {
    expect(practicable(block)).toBe(true);
    expect(practicable({ ...block, doctrine: {}, application: "" })).toBe(
      false,
    );
  });
});
