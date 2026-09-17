// 수강 정책(plan_policies) 그룹별 「폼이 모르는 칸」 보호 — feat-11-015 P3-c (원장 결정 2026-09-17).
// 폼(PlanPolicyFields)이 courseFormatFormRules(format).policyGroups 로 숨긴 그룹은 값을 보내지 않는다.
// 그런데 policySchema 는 미전송 칸을 false·0·null 로 파싱하고 upsertPlanPolicy 는 22칸 전부를 upsert 하므로,
// 폼만 숨기면 저장값이 조용히 덮인다. 이 모듈이 파싱 결과 위에 숨긴 그룹의 칸을 되돌린다:
//   update = 기존 행(kept)의 값 그대로 / create(기존 행 없음) = DDL 기본값.
// 순수 함수 — 서버 의존 없음(vitest 대상). 소비처: api/admin-plan.tsx.
import type { PolicyGroupRules } from "~/features/lms/lib/course-format";

/** 그룹이 소유하는 정책 칸(camelCase, PlanPolicy·policySchema 출력과 같은 이름). 수강기간·정규 기간·기기 수는 그룹 밖. */
export interface PolicyGroupFields {
  multiplier: number | null;
  allowPc: boolean;
  allowMobile: boolean;
  allowDownload: boolean;
  pauseAllowed: boolean;
  pauseMaxCount: number;
  pauseMinDays: number;
  pauseMaxDays: number;
  pauseTotalDays: number;
  extensionAllowed: boolean | null;
  extensionPlanIds: string[];
  extensionPriceKrw: number | null;
  extensionMaxCount: number | null;
  extensionDays: number | null;
}

export type PolicyGroupKey = keyof PolicyGroupRules;

/** 그룹 → 칸 매핑. 새 정책 칸이 생기면 여기에 넣어야 숨김 보호가 붙는다(테스트가 14칸 전부의 소속을 검사). */
export const POLICY_GROUP_FIELDS: Record<
  PolicyGroupKey,
  readonly (keyof PolicyGroupFields)[]
> = {
  multiplier: ["multiplier"],
  device: ["allowPc", "allowMobile", "allowDownload"],
  pause: [
    "pauseAllowed",
    "pauseMaxCount",
    "pauseMinDays",
    "pauseMaxDays",
    "pauseTotalDays",
  ],
  extension: [
    "extensionAllowed",
    "extensionPlanIds",
    "extensionPriceKrw",
    "extensionMaxCount",
    "extensionDays",
  ],
};

/**
 * 기존 행이 없을 때(create) 숨긴 그룹에 넣는 값 = plan_policies DDL 기본값.
 *   scripts/sql/20260708_lms_m2_tables.sql:119 (pause 0/0/1/30 · allow true/true/false · multiplier null)
 *   scripts/sql/20260901_course_extension.sql (extension_allowed 는 NOT NULL·default 를 내려 null = 운영 기본값 따름).
 * ★폼의 신규 입력 기본값(횟수 2·최소 7·최대 60·누적 90)과 일부러 다르다 — 그건 「운영자가 보고 고르는 초기값」이고,
 *   이건 「운영자가 보지 못한 칸」이므로 DB 가 스스로 채웠을 값과 같아야 한다.
 */
export const HIDDEN_POLICY_GROUP_DEFAULTS: Readonly<PolicyGroupFields> = {
  multiplier: null,
  allowPc: true,
  allowMobile: true,
  allowDownload: false,
  pauseAllowed: false,
  pauseMaxCount: 0,
  pauseMinDays: 1,
  pauseMaxDays: 30,
  pauseTotalDays: 0,
  extensionAllowed: null,
  extensionPlanIds: [],
  extensionPriceKrw: null,
  extensionMaxCount: null,
  extensionDays: null,
};

/**
 * 파싱된 정책(parsed) 위에 숨긴 그룹(groups[k]=false)의 칸을 kept(기존 행) 값으로, kept 가 없으면 DDL 기본값으로
 * 되돌린 새 객체를 돌려준다. 노출 그룹의 칸과 그룹 밖 칸(수강기간·정규 기간·기기 수)은 parsed 그대로.
 * 입력을 변경하지 않는다(extensionPlanIds 배열도 복사).
 */
export function applyHiddenPolicyGroups<T extends PolicyGroupFields>(
  parsed: T,
  groups: PolicyGroupRules,
  kept?: PolicyGroupFields | null,
): T {
  const source: PolicyGroupFields = kept ?? HIDDEN_POLICY_GROUP_DEFAULTS;
  const out: T = { ...parsed };
  for (const key of Object.keys(POLICY_GROUP_FIELDS) as PolicyGroupKey[]) {
    if (groups[key]) continue;
    for (const field of POLICY_GROUP_FIELDS[key]) {
      const value = source[field];
      // 배열은 복사 — 호출자가 kept/기본값 객체를 공유하고 있어도 서로 오염되지 않게.
      (out as PolicyGroupFields)[field] = (
        Array.isArray(value) ? [...value] : value
      ) as never;
    }
  }
  return out;
}
