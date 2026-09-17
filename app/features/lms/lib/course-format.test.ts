import { describe, expect, it } from "vitest";

import {
  COURSE_FORMATS,
  type CourseFormat,
  type CourseFormatFormRules,
  type PolicyGroupRules,
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
  // 정책 그룹(feat-11-015 P3-c, 원장 결정 2026-09-17): 단과·혼합 = device 만 false / 패키지·현장 = 넷 다 false.
  const SINGLE_GROUPS: PolicyGroupRules = {
    multiplier: true,
    device: false,
    pause: true,
    extension: true,
  };
  const NO_GROUPS: PolicyGroupRules = {
    multiplier: false,
    device: false,
    pause: false,
    extension: false,
  };
  const table: Record<CourseFormat, Omit<CourseFormatFormRules, "hint">> = {
    online_always: {
      durationMode: "days",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "required",
      showSchedules: false,
      termFields: false,
      policyGroups: SINGLE_GROUPS,
      coursesLabel: "연결 강의(에디션)",
    },
    online_term: {
      durationMode: "fixed",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "hidden",
      showSchedules: false,
      termFields: true,
      policyGroups: SINGLE_GROUPS,
      coursesLabel: "연결 강의(에디션)",
    },
    offline: {
      durationMode: "any",
      showOnlinePolicy: false,
      showCourses: false,
      plannedSessions: "hidden",
      showSchedules: true,
      termFields: false,
      policyGroups: NO_GROUPS,
      coursesLabel: "연결 강의(에디션)",
    },
    blended: {
      durationMode: "any",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "optional",
      showSchedules: true,
      termFields: false,
      policyGroups: SINGLE_GROUPS,
      coursesLabel: "연결 강의(에디션)",
    },
    package_term: {
      durationMode: "fixed",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "hidden",
      showSchedules: false,
      termFields: true,
      policyGroups: NO_GROUPS,
      coursesLabel: "패키지 구성 강의(다중 선택)",
    },
    package_always: {
      durationMode: "days",
      showOnlinePolicy: true,
      showCourses: true,
      plannedSessions: "optional",
      showSchedules: false,
      termFields: false,
      policyGroups: NO_GROUPS,
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

  it("정규 기간 칸(P3-b)은 종료일 고정 유형(온라인 정규·정규 패키지)에서만 — 현장·혼합은 cadence 가 term 이어도 닫힌다", () => {
    expect(COURSE_FORMATS.filter((f) => courseFormatFormRules(f).termFields)).toEqual([
      "online_term",
      "package_term",
    ]);
    for (const f of COURSE_FORMATS) {
      const r = courseFormatFormRules(f);
      expect(r.termFields).toBe(r.durationMode === "fixed");
    }
  });

  it("정책·연결 강의 블록은 온라인 수강권이 나가는 유형에서만, 현장 일정은 좌석이 필요한 유형에서만", () => {
    for (const f of COURSE_FORMATS) {
      const r = courseFormatFormRules(f);
      expect(r.showOnlinePolicy).toBe(hasOnlineDelivery(f));
      expect(r.showCourses).toBe(hasOnlineDelivery(f));
      expect(r.showSchedules).toBe(needsSeat(f));
    }
  });

  it("정책 그룹(P3-c) — 패키지는 넷 다 닫히고, 기기/다운로드는 어느 유형에도 없고, 배수·일시정지·연장은 온라인 단과·혼합에만", () => {
    const groups = (f: CourseFormat) => courseFormatFormRules(f).policyGroups;
    for (const f of COURSE_FORMATS.filter(isPackageFormat)) {
      expect(groups(f)).toEqual({ multiplier: false, device: false, pause: false, extension: false });
    }
    expect(COURSE_FORMATS.filter((f) => groups(f).device)).toEqual([]);
    expect(COURSE_FORMATS.filter((f) => groups(f).multiplier)).toEqual([
      "online_always",
      "online_term",
      "blended",
    ]);
    for (const f of COURSE_FORMATS) {
      const g = groups(f);
      // 세 그룹은 같은 축(단과·혼합)으로 열리고 닫힌다 — 하나만 달라지면 규칙이 갈라진 것.
      expect(g.pause).toBe(g.multiplier);
      expect(g.extension).toBe(g.multiplier);
      // 블록 자체가 없는 유형(현장)에서 그룹이 열려 있으면 안 된다.
      if (!courseFormatFormRules(f).showOnlinePolicy) {
        expect(Object.values(g).some(Boolean)).toBe(false);
      }
    }
  });
});
