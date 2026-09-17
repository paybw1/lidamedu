// feat-11-015 D17 — 「연장 상품」 진입점 게이트(패키지 연장 원천 거절) 회귀.
import { describe, expect, it } from "vitest";

import { canOfferExtensionEntry } from "./extension-entry";

describe("canOfferExtensionEntry (feat-11-015 D17)", () => {
  it("온라인 단과(course + online_*) 는 연다 — course_format null 인 구법 course 상품도 종전대로 연다", () => {
    expect(
      canOfferExtensionEntry({
        productKind: "course",
        courseFormat: "online_always",
      }),
    ).toBe(true);
    expect(
      canOfferExtensionEntry({
        productKind: "course",
        courseFormat: "online_term",
      }),
    ).toBe(true);
    expect(
      canOfferExtensionEntry({ productKind: "course", courseFormat: null }),
    ).toBe(true);
  });

  it("tpass(패키지 상품 종류)는 유형과 무관하게 닫는다 — 상품 행을 못 찾은 null 도 닫는다", () => {
    expect(
      canOfferExtensionEntry({
        productKind: "tpass",
        courseFormat: "package_always",
      }),
    ).toBe(false);
    expect(
      canOfferExtensionEntry({ productKind: "tpass", courseFormat: null }),
    ).toBe(false);
    expect(
      canOfferExtensionEntry({ productKind: null, courseFormat: null }),
    ).toBe(false);
  });

  it("course 라도 패키지 유형(package_term/package_always)이면 닫는다", () => {
    expect(
      canOfferExtensionEntry({
        productKind: "course",
        courseFormat: "package_term",
      }),
    ).toBe(false);
    expect(
      canOfferExtensionEntry({
        productKind: "course",
        courseFormat: "package_always",
      }),
    ).toBe(false);
  });
});
