import { describe, expect, it } from "vitest";

import {
  FILTER_ALL,
  parseScheduleFilter,
  scheduleFilterLabel,
  scheduleMetaLabel,
  scheduleMetaParts,
  scheduleMonogramText,
  scheduleSubjectText,
} from "./schedule-filter";
import { SCHEDULE_ELECTIVE_CODE } from "./schedule-taxonomy";

const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("parseScheduleFilter — URL 이 SSOT, 모르는 값은 all", () => {
  it("없음·빈값·모르는 값 → all", () => {
    expect(parseScheduleFilter(get({}))).toEqual({
      round: FILTER_ALL,
      subject: FILTER_ALL,
    });
    expect(parseScheduleFilter(get({ round: "1차", subject: "law" }))).toEqual({
      round: FILTER_ALL,
      subject: FILTER_ALL,
    });
  });
  it("round1/round2 · 과목 7값만 통과", () => {
    expect(
      parseScheduleFilter(get({ round: "round2", subject: "elective2" })),
    ).toEqual({ round: "round2", subject: "elective2" });
    expect(
      parseScheduleFilter(get({ round: "round1", subject: "patent" })),
    ).toEqual({ round: "round1", subject: "patent" });
  });
});

describe("scheduleFilterLabel — 빈 상태 문구용", () => {
  it("전체면 빈 문자열, 아니면 「1차 특허법」", () => {
    expect(scheduleFilterLabel({ round: "all", subject: "all" })).toBe("");
    expect(scheduleFilterLabel({ round: "round1", subject: "all" })).toBe(
      "1차",
    );
    expect(scheduleFilterLabel({ round: "all", subject: "patent" })).toBe(
      "특허법",
    );
    expect(scheduleFilterLabel({ round: "round1", subject: "patent" })).toBe(
      "1차 특허법",
    );
  });
  it("2차 + 「2차 선택」은 구분 낱말 생략(중복 방지), 1차 + 「2차 선택」은 그대로", () => {
    expect(
      scheduleFilterLabel({ round: "round2", subject: SCHEDULE_ELECTIVE_CODE }),
    ).toBe("2차 선택");
    expect(
      scheduleFilterLabel({ round: "round1", subject: SCHEDULE_ELECTIVE_CODE }),
    ).toBe("1차 2차 선택");
  });
});

describe("카드 메타·모노그램", () => {
  const base = { subject_code: "patent", subject_label: "특허법(입력)" };
  it("코드 라벨 우선, 코드 없으면 운영자 입력 라벨 폴백", () => {
    expect(scheduleSubjectText(base)).toBe("특허법");
    expect(
      scheduleSubjectText({ subject_code: null, subject_label: "옛 과목" }),
    ).toBe("옛 과목");
  });
  it("구분 있으면 앞에, 없으면 과목만", () => {
    expect(scheduleMetaParts({ ...base, exam_round: "round1" })).toEqual([
      "1차",
      "특허법",
    ]);
    expect(scheduleMetaParts({ ...base, exam_round: null })).toEqual([
      "특허법",
    ]);
    expect(scheduleMetaLabel({ ...base, exam_round: "round2" })).toBe(
      "2차 · 특허법",
    );
  });
  it("2차 + 「2차 선택」 → 「2차 선택」 하나, 모노그램은 「선택」", () => {
    const s = {
      exam_round: "round2",
      subject_code: SCHEDULE_ELECTIVE_CODE,
      subject_label: "2차 선택",
    };
    expect(scheduleMetaParts(s)).toEqual(["2차 선택"]);
    expect(scheduleMonogramText(s)).toBe("선택");
    expect(scheduleMonogramText(base)).toBe("특허법");
  });
});
