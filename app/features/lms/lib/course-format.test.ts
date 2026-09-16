import { describe, expect, it } from "vitest";

import {
  COURSE_FORMATS,
  cadenceOf,
  deliveryOf,
  describeCourseFormatAxes,
  hasOnlineDelivery,
  isPackageFormat,
  needsSeat,
  packagingOf,
  toCourseFormat,
} from "./course-format";

describe("course-format (feat-11-013 P2)", () => {
  it("6유형이 요청서 순서대로 고정돼 있다", () => {
    expect(COURSE_FORMATS).toEqual([
      "online_always",
      "online_term",
      "offline",
      "blended",
      "package_term",
      "package_always",
    ]);
  });

  it("toCourseFormat 은 알려진 값만 통과시킨다", () => {
    expect(toCourseFormat("offline")).toBe("offline");
    expect(toCourseFormat("")).toBeNull();
    expect(toCourseFormat(null)).toBeNull();
    expect(toCourseFormat("onsite")).toBeNull(); // lecture_category 값은 다른 축
  });

  it("파생 3축 — 온라인/현장/혼합 · 단과/패키지 · 상시/정규", () => {
    expect(deliveryOf("online_always")).toBe("online");
    expect(deliveryOf("package_term")).toBe("online");
    expect(deliveryOf("offline")).toBe("offline");
    expect(deliveryOf("blended")).toBe("blended");
    expect(packagingOf("package_always")).toBe("package");
    expect(packagingOf("blended")).toBe("single");
    expect(cadenceOf("online_always")).toBe("always");
    expect(cadenceOf("package_always")).toBe("always");
    expect(cadenceOf("online_term")).toBe("term");
    expect(cadenceOf("offline")).toBe("term"); // 개강일이 정해진 과정
    expect(describeCourseFormatAxes("blended")).toBe("혼합 · 단과 · 정규");
  });

  it("이행 술어 — 현장만 온라인 수강권이 없고, 현장·혼합만 좌석이 필요하다", () => {
    expect(COURSE_FORMATS.filter((f) => !hasOnlineDelivery(f))).toEqual(["offline"]);
    expect(COURSE_FORMATS.filter(needsSeat)).toEqual(["offline", "blended"]);
    expect(COURSE_FORMATS.filter(isPackageFormat)).toEqual(["package_term", "package_always"]);
  });
});
