// 강의 캘린더 분류 SSOT(schedule-taxonomy) 테스트.
//
// ★7옵션 순서는 관리자 select·캘린더 칩의 표시 순서이고, elective2(「2차 선택」)는
//   일정·캘린더 전용이라 LMS 과목 SSOT 에 섞이면 도서·강의개설 CHECK 와 어긋난다.
// ★matchesScheduleFilter 는 캘린더(갈래 B)가 그대로 쓰는 술어 — NULL(구분 없음)은
//   'all' 에서만 보인다는 계약을 표로 고정한다.
import { describe, expect, it } from "vitest";

import {
  LMS_SUBJECT_CODES,
  LMS_SUBJECT_OPTIONS,
} from "~/features/lms/lib/subject-options";

import {
  EXAM_ROUNDS,
  EXAM_ROUND_LABEL,
  EXAM_ROUND_NONE_LABEL,
  SCHEDULE_ELECTIVE_CODE,
  SCHEDULE_SUBJECT_OPTIONS,
  examRoundLabel,
  isScheduleSubjectCode,
  matchesScheduleFilter,
  scheduleSubjectLabel,
  toExamRound,
} from "./schedule-taxonomy";

describe("SCHEDULE_SUBJECT_OPTIONS", () => {
  it("LMS 6과목 순서 그대로 + 「2차 선택」이 마지막(7옵션)", () => {
    expect(SCHEDULE_SUBJECT_OPTIONS.map((o) => o.value)).toEqual([
      ...LMS_SUBJECT_CODES,
      SCHEDULE_ELECTIVE_CODE,
    ]);
    expect(SCHEDULE_SUBJECT_OPTIONS).toHaveLength(7);
    expect(SCHEDULE_SUBJECT_OPTIONS.at(-1)).toEqual({
      value: "elective2",
      label: "2차 선택",
    });
  });

  it("LMS 6과목 라벨은 LMS SSOT 와 같다", () => {
    expect(SCHEDULE_SUBJECT_OPTIONS.slice(0, 6)).toEqual([
      ...LMS_SUBJECT_OPTIONS,
    ]);
  });

  it("elective2 는 LMS 과목 SSOT 에 섞이지 않는다", () => {
    expect((LMS_SUBJECT_CODES as readonly string[]).includes("elective2")).toBe(
      false,
    );
  });
});

describe("scheduleSubjectLabel / isScheduleSubjectCode", () => {
  it("7값은 라벨, 그 밖은 null", () => {
    for (const o of SCHEDULE_SUBJECT_OPTIONS) {
      expect(scheduleSubjectLabel(o.value)).toBe(o.label);
      expect(isScheduleSubjectCode(o.value)).toBe(true);
    }
    expect(scheduleSubjectLabel("elective2")).toBe("2차 선택");
    expect(scheduleSubjectLabel("patent")).toBe("특허법");
    for (const bad of ["", "law", "PATENT", null, undefined]) {
      expect(scheduleSubjectLabel(bad)).toBeNull();
      expect(isScheduleSubjectCode(bad)).toBe(false);
    }
    expect(isScheduleSubjectCode(1)).toBe(false);
    expect(isScheduleSubjectCode({})).toBe(false);
  });
});

describe("toExamRound / examRoundLabel", () => {
  it("round1·round2 만 통과, 빈값·모르는 값은 null", () => {
    expect(EXAM_ROUNDS).toEqual(["round1", "round2"]);
    expect(toExamRound("round1")).toBe("round1");
    expect(toExamRound("round2")).toBe("round2");
    for (const bad of ["", "all", "round3", "1차", null, undefined]) {
      expect(toExamRound(bad)).toBeNull();
    }
  });

  it("라벨 — 1차/2차, NULL·모르는 값은 「구분 없음」", () => {
    expect(EXAM_ROUND_LABEL).toEqual({ round1: "1차", round2: "2차" });
    expect(examRoundLabel("round1")).toBe("1차");
    expect(examRoundLabel("round2")).toBe("2차");
    expect(examRoundLabel(null)).toBe(EXAM_ROUND_NONE_LABEL);
    expect(examRoundLabel("")).toBe(EXAM_ROUND_NONE_LABEL);
    expect(examRoundLabel("x")).toBe(EXAM_ROUND_NONE_LABEL);
    expect(EXAM_ROUND_NONE_LABEL).toBe("구분 없음");
  });
});

describe("matchesScheduleFilter", () => {
  // 표: round 필터 3 × exam_round 3(null/round1/round2). subject 는 'all' 로 고정.
  it.each<["all" | "round1" | "round2", string | null, boolean]>([
    ["all", null, true],
    ["all", "round1", true],
    ["all", "round2", true],
    ["round1", null, false],
    ["round1", "round1", true],
    ["round1", "round2", false],
    ["round2", null, false],
    ["round2", "round1", false],
    ["round2", "round2", true],
  ])("round=%s × exam_round=%s → %s", (round, examRound, expected) => {
    expect(
      matchesScheduleFilter(
        { exam_round: examRound, subject_code: "patent" },
        { round, subject: "all" },
      ),
    ).toBe(expected);
  });

  // 표: subject 필터 3(all/일치/불일치) × subject_code 3(null/patent/elective2). round 는 'all' 로 고정.
  it.each<[string, string | null, boolean]>([
    ["all", null, true],
    ["all", "patent", true],
    ["all", "elective2", true],
    ["patent", null, false],
    ["patent", "patent", true],
    ["patent", "elective2", false],
    ["elective2", null, false],
    ["elective2", "patent", false],
    ["elective2", "elective2", true],
  ])("subject=%s × subject_code=%s → %s", (subject, code, expected) => {
    expect(
      matchesScheduleFilter(
        { exam_round: null, subject_code: code },
        { round: "all", subject },
      ),
    ).toBe(expected);
  });

  it("두 축은 AND — 한 축이라도 어긋나면 false", () => {
    const s = { exam_round: "round2", subject_code: "elective2" };
    expect(
      matchesScheduleFilter(s, { round: "round2", subject: "elective2" }),
    ).toBe(true);
    expect(
      matchesScheduleFilter(s, { round: "round1", subject: "elective2" }),
    ).toBe(false);
    expect(
      matchesScheduleFilter(s, { round: "round2", subject: "patent" }),
    ).toBe(false);
    expect(matchesScheduleFilter(s, { round: "all", subject: "all" })).toBe(
      true,
    );
  });

  it("구분 없음(NULL)은 구분 'all' 에서만 보인다", () => {
    const s = { exam_round: null, subject_code: "civil" };
    expect(matchesScheduleFilter(s, { round: "all", subject: "civil" })).toBe(
      true,
    );
    expect(
      matchesScheduleFilter(s, { round: "round1", subject: "civil" }),
    ).toBe(false);
    expect(
      matchesScheduleFilter(s, { round: "round2", subject: "civil" }),
    ).toBe(false);
  });
});
