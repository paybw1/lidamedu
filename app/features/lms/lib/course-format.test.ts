import { describe, expect, it } from "vitest";

import {
  COURSE_FORMATS,
  type CourseFormat,
  type CourseFormatFormRules,
  cadenceOf,
  courseFormatFormRules,
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

describe("courseFormatFormRules (feat-11-013 P3-a — 유형별 조건부 노출·검증)", () => {
  // 6유형 × 항목 매트릭스(hint 제외). 폼과 서버가 이 표 하나로 판정한다.
  const table: Record<CourseFormat, Omit<CourseFormatFormRules, "hint">> = {
    online_always: {
      durationMode: "days",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "required",
      showSchedules: false,
      coursesLabel: "연결 강의(에디션)",
    },
    online_term: {
      durationMode: "fixed",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "hidden",
      showSchedules: false,
      coursesLabel: "연결 강의(에디션)",
    },
    offline: {
      durationMode: "any",
      showOnlinePolicy: false,
      showCourses: false,
      plannedSessions: "hidden",
      showSchedules: true,
      coursesLabel: "연결 강의(에디션)",
    },
    blended: {
      durationMode: "any",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "optional",
      showSchedules: true,
      coursesLabel: "연결 강의(에디션)",
    },
    package_term: {
      durationMode: "fixed",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "hidden",
      showSchedules: false,
      coursesLabel: "패키지 구성 강의(다중 선택)",
    },
    package_always: {
      durationMode: "days",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "optional",
      showSchedules: false,
      coursesLabel: "패키지 구성 강의(다중 선택)",
    },
  };

  it.each(COURSE_FORMATS)("%s 의 규칙이 표와 같다", (f) => {
    const { hint, ...rest } = courseFormatFormRules(f);
    expect(rest).toEqual(table[f]);
    expect(hint.length).toBeGreaterThan(0);
  });

  it("회차 필수는 온라인 상시뿐이고, 정규·현장은 숨긴다(회차→단과 계산 전환 방지)", () => {
    expect(COURSE_FORMATS.filter((f) => courseFormatFormRules(f).plannedSessions === "required")).toEqual([
      "online_always",
    ]);
    expect(COURSE_FORMATS.filter((f) => courseFormatFormRules(f).plannedSessions === "hidden")).toEqual([
      "online_term",
      "offline",
      "package_term",
    ]);
  });

  it("정책·연결 강의 블록은 온라인 수강권이 나가는 유형에서만, 현장 일정은 좌석이 필요한 유형에서만", () => {
    for (const f of COURSE_FORMATS) {
      const r = courseFormatFormRules(f);
      expect(r.showOnlinePolicy).toBe(hasOnlineDelivery(f));
      expect(r.showCourses).toBe(hasOnlineDelivery(f));
      expect(r.showSchedules).toBe(needsSeat(f));
    }
  });
});
