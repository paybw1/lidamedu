import { describe, expect, it } from "vitest";

import {
  PANEL_TAB_ORDER,
  pickInitialPanelTab,
} from "~/features/laws/lib/panel-tab-order";

describe("pickInitialPanelTab", () => {
  it("포스트잇이 있으면 무엇보다 먼저 연다", () => {
    expect(
      pickInitialPanelTab({ memo: 1, comment: 5, ox: 3, bookmark: 1 }),
    ).toBe("memo");
  });

  it("포스트잇이 없으면 코멘트 → 정오문제 순으로 내려간다", () => {
    expect(pickInitialPanelTab({ memo: 0, comment: 2, ox: 3 })).toBe("comment");
    expect(pickInitialPanelTab({ memo: 0, comment: 0, ox: 3 })).toBe("ox");
  });

  it("지시받은 순서를 그대로 따른다", () => {
    const order = [
      "memo",
      "comment",
      "ox",
      "related-problems",
      "qna",
      "materials",
      "highlight",
      "bookmark",
    ] as const;
    // 뒤에서부터 하나씩만 채워 넣으면, 그때마다 그 탭이 열려야 한다.
    for (let i = order.length - 1; i >= 0; i--) {
      expect(pickInitialPanelTab({ [order[i]]: 1 })).toBe(order[i]);
    }
    // 두 개가 동시에 있으면 앞선 것.
    for (let i = 0; i < order.length - 1; i++) {
      expect(pickInitialPanelTab({ [order[i]]: 1, [order[i + 1]]: 9 })).toBe(
        order[i],
      );
    }
  });

  it("탭 자체가 없는 경우(undefined)는 0 과 같이 취급한다", () => {
    expect(pickInitialPanelTab({ memo: 0, comment: undefined, ox: 1 })).toBe("ox");
  });

  it("아무 것도 없으면 포스트잇으로 연다", () => {
    expect(pickInitialPanelTab({})).toBe("memo");
    expect(pickInitialPanelTab({ memo: 0, highlight: 0, bookmark: 0 })).toBe("memo");
  });

  it("즐겨찾기(중요도)는 맨 끝 — 다른 게 하나라도 있으면 먼저 열리지 않는다", () => {
    expect(PANEL_TAB_ORDER[PANEL_TAB_ORDER.length - 1]).toBe("bookmark");
    expect(pickInitialPanelTab({ bookmark: 1, highlight: 1 })).toBe("highlight");
    expect(pickInitialPanelTab({ bookmark: 1 })).toBe("bookmark");
  });
});
