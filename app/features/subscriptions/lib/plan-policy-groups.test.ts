import { describe, expect, it } from "vitest";

import {
  type PolicyGroupRules,
  courseFormatFormRules,
} from "~/features/lms/lib/course-format";

import {
  HIDDEN_POLICY_GROUP_DEFAULTS,
  POLICY_GROUP_FIELDS,
  type PolicyGroupFields,
  applyHiddenPolicyGroups,
} from "./plan-policy-groups";

// policySchema 가 「미전송 칸」을 파싱한 모습 — false·0·null(무제한)·[]·null(기본값 따름).
//   그룹 밖 칸(수강기간·정규 기간·기기 수)도 함께 실어 「그대로 통과」를 검사한다.
type Parsed = PolicyGroupFields & {
  durationDays: number | null;
  fixedEndDate: string | null;
  startsOn: string | null;
  maxDevicesPc?: number | null;
};
const parsedFromEmptyForm: Parsed = {
  durationDays: 180,
  fixedEndDate: null,
  startsOn: null,
  maxDevicesPc: undefined,
  multiplier: null,
  allowPc: false,
  allowMobile: false,
  allowDownload: false,
  pauseAllowed: false,
  pauseMaxCount: 0,
  pauseMinDays: 0,
  pauseMaxDays: 0,
  pauseTotalDays: 0,
  extensionAllowed: null,
  extensionPlanIds: [],
  extensionPriceKrw: null,
  extensionMaxCount: null,
  extensionDays: null,
};

// 운영 pt_tpass 처럼 「폼에서 사라지기 전」에 저장돼 있던 값(전부 기본값과 다르게 잡는다).
const kept: PolicyGroupFields = {
  multiplier: 2.5,
  allowPc: false,
  allowMobile: true,
  allowDownload: true,
  pauseAllowed: true,
  pauseMaxCount: 3,
  pauseMinDays: 7,
  pauseMaxDays: 60,
  pauseTotalDays: 90,
  extensionAllowed: true,
  extensionPlanIds: ["11111111-1111-4111-8111-111111111111"],
  extensionPriceKrw: 30000,
  extensionMaxCount: 2,
  extensionDays: 30,
};

const ALL_OPEN: PolicyGroupRules = {
  multiplier: true,
  device: true,
  pause: true,
  extension: true,
};

describe("plan-policy-groups (feat-11-015 P3-c — 숨긴 정책 그룹 저장값 보호)", () => {
  it("그룹 매핑이 14칸 전부를 한 번씩만 소유한다(새 칸이 보호 없이 새지 않게)", () => {
    const all = Object.values(POLICY_GROUP_FIELDS).flat();
    expect(all.length).toBe(Object.keys(HIDDEN_POLICY_GROUP_DEFAULTS).length);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual(
      Object.keys(HIDDEN_POLICY_GROUP_DEFAULTS).sort(),
    );
  });

  it("update — 패키지(넷 다 숨김)는 파싱값 대신 기존 행 값을 전부 유지하고, 그룹 밖 칸은 파싱값 그대로", () => {
    const rules = courseFormatFormRules("package_term").policyGroups;
    const out = applyHiddenPolicyGroups(parsedFromEmptyForm, rules, kept);
    for (const field of Object.keys(kept) as (keyof PolicyGroupFields)[]) {
      expect(out[field]).toEqual(kept[field]);
    }
    expect(out.durationDays).toBe(180);
    expect(out.fixedEndDate).toBeNull();
    expect(out.startsOn).toBeNull();
    expect(out.maxDevicesPc).toBeUndefined();
    // 입력 불변 + 배열 비공유
    expect(parsedFromEmptyForm.pauseAllowed).toBe(false);
    expect(out.extensionPlanIds).not.toBe(kept.extensionPlanIds);
  });

  it("create — 기존 행이 없으면 숨긴 그룹은 DDL 기본값(allow true/true/false · pause false·0·0·1·30 · multiplier null · extension null)", () => {
    const rules = courseFormatFormRules("package_always").policyGroups;
    for (const noRow of [undefined, null]) {
      const out = applyHiddenPolicyGroups(parsedFromEmptyForm, rules, noRow);
      expect(out.allowPc).toBe(true);
      expect(out.allowMobile).toBe(true);
      expect(out.allowDownload).toBe(false);
      expect(out.pauseAllowed).toBe(false);
      expect(out.pauseMaxCount).toBe(0);
      expect(out.pauseTotalDays).toBe(0);
      expect(out.pauseMinDays).toBe(1);
      expect(out.pauseMaxDays).toBe(30);
      expect(out.multiplier).toBeNull();
      // 20260901_course_extension 이 NOT NULL·default 를 내렸다 — false 가 아니라 null(운영 기본값 따름).
      expect(out.extensionAllowed).toBeNull();
      expect(out.extensionPlanIds).toEqual([]);
      expect(out.extensionPriceKrw).toBeNull();
      expect(out.extensionMaxCount).toBeNull();
      expect(out.extensionDays).toBeNull();
    }
  });

  it("단과·혼합(device 만 숨김) — 배수·일시정지·연장은 파싱값, 기기/다운로드만 kept(또는 기본값)", () => {
    const parsed: Parsed = {
      ...parsedFromEmptyForm,
      multiplier: 1.5,
      pauseAllowed: true,
      pauseMaxCount: 1,
      pauseMinDays: 3,
      pauseMaxDays: 10,
      pauseTotalDays: 20,
      extensionAllowed: false,
      extensionPlanIds: ["22222222-2222-4222-8222-222222222222"],
      extensionPriceKrw: 0,
    };
    for (const format of ["online_always", "online_term", "blended"] as const) {
      const rules = courseFormatFormRules(format).policyGroups;
      const withKept = applyHiddenPolicyGroups(parsed, rules, kept);
      expect(withKept.multiplier).toBe(1.5);
      expect(withKept.pauseAllowed).toBe(true);
      expect(withKept.pauseMaxCount).toBe(1);
      expect(withKept.pauseTotalDays).toBe(20);
      expect(withKept.extensionAllowed).toBe(false);
      expect(withKept.extensionPlanIds).toEqual(parsed.extensionPlanIds);
      expect(withKept.extensionPriceKrw).toBe(0);
      expect(withKept.allowPc).toBe(kept.allowPc);
      expect(withKept.allowMobile).toBe(kept.allowMobile);
      expect(withKept.allowDownload).toBe(kept.allowDownload);

      const created = applyHiddenPolicyGroups(parsed, rules, null);
      expect(created.allowPc).toBe(true);
      expect(created.allowMobile).toBe(true);
      expect(created.allowDownload).toBe(false);
      expect(created.multiplier).toBe(1.5);
    }
  });

  it("전부 노출이면 파싱값을 그대로 돌려준다(kept 가 있어도 무시)", () => {
    const out = applyHiddenPolicyGroups(parsedFromEmptyForm, ALL_OPEN, kept);
    expect(out).toEqual(parsedFromEmptyForm);
  });
});
