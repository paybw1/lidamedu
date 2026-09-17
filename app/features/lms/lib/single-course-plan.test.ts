// feat-11-015 D17 — 「구성 강의의 단과 상품」 선택 규칙 fixture.
import { describe, expect, it } from "vitest";

import {
  pickSingleCoursePlan,
  type SingleCoursePlanCandidate,
} from "./single-course-plan";

function candidate(
  overrides: Partial<SingleCoursePlanCandidate> & { planId: string },
): SingleCoursePlanCandidate {
  return {
    courseFormat: "online_always",
    productKind: "course",
    saleStatus: "on_sale",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("pickSingleCoursePlan (feat-11-015 D17)", () => {
  it("후보가 없으면 null — 빈 배열·전부 부적격", () => {
    expect(pickSingleCoursePlan([])).toBeNull();
    expect(
      pickSingleCoursePlan([
        candidate({ planId: "tpass", productKind: "tpass" }),
        candidate({ planId: "subscription", courseFormat: null }),
        candidate({ planId: "offline", courseFormat: "offline" }),
      ]),
    ).toBeNull();
  });

  it("판매중(on_sale)이 최신 생성보다 우선한다", () => {
    expect(
      pickSingleCoursePlan([
        candidate({
          planId: "newer-closed",
          saleStatus: "closed",
          createdAt: "2026-09-01T00:00:00Z",
        }),
        candidate({
          planId: "older-on-sale",
          saleStatus: "on_sale",
          createdAt: "2025-01-01T00:00:00Z",
        }),
      ]),
    ).toBe("older-on-sale");
  });

  it("같은 판매 상태면 created_at 최신을 고른다", () => {
    expect(
      pickSingleCoursePlan([
        candidate({
          planId: "old",
          saleStatus: "closed",
          createdAt: "2025-01-01T00:00:00Z",
        }),
        candidate({
          planId: "new",
          saleStatus: "closed",
          createdAt: "2026-06-01T00:00:00Z",
        }),
        candidate({
          planId: "mid",
          saleStatus: "hidden",
          createdAt: "2026-03-01T00:00:00Z",
        }),
      ]),
    ).toBe("new");
  });

  it("패키지 상품은 판매중·최신이어도 제외한다", () => {
    expect(
      pickSingleCoursePlan([
        candidate({
          planId: "package-newest",
          courseFormat: "package_always",
          createdAt: "2026-09-10T00:00:00Z",
        }),
        candidate({
          planId: "package-term",
          courseFormat: "package_term",
          createdAt: "2026-09-09T00:00:00Z",
        }),
        candidate({
          planId: "single",
          courseFormat: "online_term",
          saleStatus: "closed",
          createdAt: "2026-01-01T00:00:00Z",
        }),
      ]),
    ).toBe("single");
  });

  // Postgres 는 소수초 후행 0 을 절삭한다 — 같은 초에 만든 두 상품이 `…33+00:00` / `…33.5+00:00` 로
  // 공존할 수 있고, localeCompare 로 비교하면 '+' 가 '.' 뒤라 더 이른 쪽이 최신으로 잡혔다.
  it("created_at 은 시각으로 비교한다 — 소수초 절삭 표기가 섞여도 뒤에 만든 쪽", () => {
    expect(
      pickSingleCoursePlan([
        candidate({
          planId: "whole-second",
          createdAt: "2026-07-09T05:12:33+00:00",
        }),
        candidate({
          planId: "half-second-later",
          createdAt: "2026-07-09T05:12:33.5+00:00",
        }),
      ]),
    ).toBe("half-second-later");
    // 같은 밀리초에서 마이크로초만 다르면 코드포인트 비교로 뒤에 만든 쪽.
    expect(
      pickSingleCoursePlan([
        candidate({
          planId: "micro-later",
          createdAt: "2026-07-09T05:12:33.500002+00:00",
        }),
        candidate({
          planId: "micro-earlier",
          createdAt: "2026-07-09T05:12:33.5+00:00",
        }),
      ]),
    ).toBe("micro-later");
  });
});
