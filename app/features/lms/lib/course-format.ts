// 과정 유형(운영 방식) SSOT — feat-11-013 D1.
// product_kind(무엇을 주는가: 구독/수강권)와 직교하는 「어떻게 운영하는가」 축.
// 강의상품(product_kind course/tpass)만 값을 갖고, 학습 플랫폼 구독은 null 이다.
// 클라·서버 공용(서버 의존 없음). 배지·필터·zod·복사·변경차단이 전부 여기만 소비한다.

export const COURSE_FORMATS = [
  "online_always",
  "online_term",
  "offline",
  "blended",
  "package_term",
  "package_always",
] as const;
export type CourseFormat = (typeof COURSE_FORMATS)[number];

/** 요청서 260914 §1 의 운영자 용어 그대로. 학생 표면도 같은 라벨을 쓴다(용어 이원화 방지). */
export const COURSE_FORMAT_LABEL: Record<CourseFormat, string> = {
  online_always: "온라인 상시",
  online_term: "온라인 정규",
  offline: "현장 강의",
  blended: "온·오프 혼합",
  package_term: "정규 패키지",
  package_always: "상시 패키지",
};

/** 등록 폼의 선택 카드에 붙는 한 줄 설명(요청서 §1 정의). */
export const COURSE_FORMAT_DESCRIPTION: Record<CourseFormat, string> = {
  online_always:
    "결제(수강신청)한 날부터 설정한 학습일수만큼 수강하는 온라인 강의. 회원마다 시작·종료일이 다르다.",
  online_term:
    "모든 수강생이 관리자가 지정한 학습기간에 맞춰 수강하는 온라인 강의. 중간 신청자의 종료일 정책을 따로 정한다.",
  offline: "학원에서 직접 수강하는 오프라인 강의. 영상 제공을 택하면 온라인 수강기간을 추가 설정한다.",
  blended:
    "현장 강의와 온라인 강의를 함께 제공하는 과정. 하나의 신청으로 현장 수강권과 온라인 수강권을 관리한다.",
  package_term: "정해진 기간에 운영되는 여러 강의를 하나로 묶어 판매하는 과정.",
  package_always:
    "여러 온라인 강의를 하나로 묶어 팔고, 수강신청일부터 설정한 일수만큼 수강하는 상품(예: T-PASS).",
};

export function toCourseFormat(value: unknown): CourseFormat | null {
  return typeof value === "string" &&
    (COURSE_FORMATS as readonly string[]).includes(value)
    ? (value as CourseFormat)
    : null;
}

export function isCourseFormat(value: unknown): value is CourseFormat {
  return toCourseFormat(value) !== null;
}

// ── 파생 축 3종 (요청서 §6 검색·구분 표시) — 저장하지 않고 유형에서 계산한다 ──

export const DELIVERY_AXES = ["online", "offline", "blended"] as const;
export type DeliveryAxis = (typeof DELIVERY_AXES)[number];
export const DELIVERY_LABEL: Record<DeliveryAxis, string> = {
  online: "온라인",
  offline: "현장",
  blended: "혼합",
};

export const PACKAGING_AXES = ["single", "package"] as const;
export type PackagingAxis = (typeof PACKAGING_AXES)[number];
export const PACKAGING_LABEL: Record<PackagingAxis, string> = {
  single: "단과",
  package: "패키지",
};

export const CADENCE_AXES = ["always", "term"] as const;
export type CadenceAxis = (typeof CADENCE_AXES)[number];
export const CADENCE_LABEL: Record<CadenceAxis, string> = {
  always: "상시",
  term: "정규",
};

/** 온라인 / 현장 / 혼합. 패키지는 온라인 수강권 묶음이므로 온라인. */
export function deliveryOf(format: CourseFormat): DeliveryAxis {
  if (format === "offline") return "offline";
  if (format === "blended") return "blended";
  return "online";
}

/** 단과 / 패키지. */
export function packagingOf(format: CourseFormat): PackagingAxis {
  return format === "package_term" || format === "package_always"
    ? "package"
    : "single";
}

/** 상시(신청일 기산) / 정규(정해진 기간). 현장·혼합은 개강일이 정해진 과정이라 정규로 분류한다. */
export function cadenceOf(format: CourseFormat): CadenceAxis {
  return format === "online_always" || format === "package_always"
    ? "always"
    : "term";
}

/** 온라인 수강권이 나가는 유형인가 — 현장(offline)만 아니다. P5 이행 분기가 소비할 술어. */
export function hasOnlineDelivery(format: CourseFormat): boolean {
  return format !== "offline";
}

/** 현장 좌석이 필요한 유형인가(현장·혼합). P5 정원 권위화가 소비할 술어. */
export function needsSeat(format: CourseFormat): boolean {
  return format === "offline" || format === "blended";
}

export function isPackageFormat(format: CourseFormat): boolean {
  return packagingOf(format) === "package";
}

// ── 종류(product_kind) ↔ 과정 유형 결합 규칙 (feat-11-015 L2) ──
// 두 축은 저장은 따로 하지만 소비처가 갈린다 — 일시정지 resolver 는 course_format(패키지 유형)로,
// 유료 연장 게이트는 product_kind(tpass)로 판정한다. 결합이 어긋난 행(course+package_* · tpass+online_always)이
// 있으면 두 게이트가 서로 다른 답을 내므로 저장 시점에 막는다.
// 규칙: 패키지 유형(package_term·package_always) ⇔ tpass, 그 밖의 유형 ⇔ course.
// ★인자를 string 으로 두는 이유는 DB `product_kind` 소비처가 string 이기 때문. 강의상품이 아닌 종류(subject·
//   bundle·membership)는 유형 자체가 null 이라 어느 유형도 허용하지 않는다(false). 이 파일은
//   `subscriptions/labels.ts` 가 import 하므로 역방향으로 isLectureProductKind 를 끌어오지 않는다 —
//   강의상품 종류가 늘면 여기에 명시적으로 결합을 추가한다.
export function isFormatAllowedForKind(
  productKind: string,
  format: CourseFormat,
): boolean {
  return isPackageFormat(format)
    ? productKind === "tpass"
    : productKind === "course";
}

/** 종류가 고를 수 있는 유형 목록 — COURSE_FORMATS 순서 유지(폼 라디오 격자가 이 순서를 쓴다). 강의상품이 아니면 []. */
export function allowedFormatsForKind(
  productKind: string,
): readonly CourseFormat[] {
  return COURSE_FORMATS.filter((f) => isFormatAllowedForKind(productKind, f));
}

// ── 중간 신청 정책 (feat-11-013 P3-b) — plan_policies.mid_entry_mode 의 값 SSOT ──
// starts_on(수강 시작일) 경과 후 결제한 수강생의 종료일 처리. NULL = until_end(현행 동작).
export const MID_ENTRY_MODES = ["until_end", "fixed_days", "closed"] as const;
export type MidEntryMode = (typeof MID_ENTRY_MODES)[number];

export const MID_ENTRY_MODE_LABEL: Record<MidEntryMode, string> = {
  until_end: "기존 종료일까지",
  fixed_days: "신청일부터 N일",
  closed: "불허(개강 후 신청 거절)",
};

export function toMidEntryMode(value: unknown): MidEntryMode | null {
  return typeof value === "string" &&
    (MID_ENTRY_MODES as readonly string[]).includes(value)
    ? (value as MidEntryMode)
    : null;
}

/** 목록·필터에서 세 축 라벨을 한 줄로: "온라인 · 단과 · 상시". */
export function describeCourseFormatAxes(format: CourseFormat): string {
  return [
    DELIVERY_LABEL[deliveryOf(format)],
    PACKAGING_LABEL[packagingOf(format)],
    CADENCE_LABEL[cadenceOf(format)],
  ].join(" · ");
}

// ── 등록 폼 규칙 (feat-11-013 P3-a, 요청서 §3 「선택 유형에 따른 입력항목 자동 변경」) ──
// 폼(admin-plans)과 서버(api/admin-plan)가 **같은 함수**로 노출·검증을 판정한다. 유형 리스트를
// 다시 적지 않고 위 술어(cadenceOf·hasOnlineDelivery·needsSeat·isPackageFormat)에서 파생한다.

/** 수강기간 방식 — 'days'|'fixed' 는 고정(라디오 없음, 서버가 덮어씀), 'any' 는 운영자 선택. */
export type DurationModeRule = "days" | "fixed" | "any";
/** 전체 예정 회차 칸 — required(온라인 상시) / optional / hidden(서버가 null 강제). */
export type PlannedSessionsRule = "required" | "optional" | "hidden";

/**
 * 수강 정책(plan_policies) 블록 안의 그룹별 노출 — feat-11-015 P3-c(원장 결정 2026-09-17).
 * false 인 그룹의 칸은 폼이 렌더하지 않고(hidden 도 안 보냄) 서버는 저장값 유지(update) / DDL 기본값(create)으로
 * 채운다(`subscriptions/lib/plan-policy-groups.ts`). 폼·서버가 이 한 객체로 판정한다.
 */
export interface PolicyGroupRules {
  /** 수강배수(multiplier). 패키지는 구성 강의의 단과 상품 배수를 따른다(B1) → 단과·혼합만. */
  multiplier: boolean;
  /** PC/모바일 허용·다운로드(allow_pc/mobile/download). 전역 DRM 정책(D18)으로 옮겨 어느 유형에도 두지 않는다(B3). */
  device: boolean;
  /** 일시정지(pause_*). 패키지는 구성 강의의 단과 상품 정책을 따른다(B2 · D17 resolver) → 단과·혼합만. */
  pause: boolean;
  /** 유료 연장(extension_*). 패키지는 원천 거절이라 폼에서 뺀다 → 단과·혼합만. */
  extension: boolean;
}

export interface CourseFormatFormRules {
  durationMode: DurationModeRule;
  /** 수강 정책(plan_policies) 블록 노출. 현장(offline)만 false — 정책 행을 만들지 않는다. */
  showOnlinePolicy: boolean;
  /** 연결 강의(plan_courses) 블록 노출. false 면 서버가 빈 배열로 동기화한다. */
  showCourses: boolean;
  plannedSessions: PlannedSessionsRule;
  /** 현장 일정(lecture_schedules) 블록 노출 — 현장·혼합. */
  showSchedules: boolean;
  /**
   * 정규 기간 칸 3종(수강 시작일·중간 신청 정책·판매 종료일, feat-11-013 P3-b) 노출.
   * = 종료일 고정 유형(온라인 정규·정규 패키지). ★cadenceOf 만으로 파생하면 현장·혼합도 term 이라
   *   네 유형에 열린다 — 이 칸들은 fixed_end_date 가 있어야 의미가 있으므로 durationMode 에서 파생한다.
   *   false 면 서버가 네 값을 null 로 강제한다.
   */
  termFields: boolean;
  /**
   * 정책 블록 안 그룹별 노출(feat-11-015 P3-c). showOnlinePolicy=false(현장)면 블록 자체가 없으므로 전부 false.
   * 패키지 = 넷 다 false, 온라인 단과·혼합 = device 만 false.
   */
  policyGroups: PolicyGroupRules;
  coursesLabel: string;
  hint: string;
}

/** 유형별 한 줄 안내(요청서 §1 용어). 폼의 유형 fieldset 아래에 표시한다. */
const FORM_HINT: Record<CourseFormat, string> = {
  online_always:
    "결제일부터 수강일수로 셉니다. 전체 예정 회차는 환불 회차 공제의 분모라 반드시 입력합니다.",
  online_term: "모든 수강생이 같은 종료일까지 수강합니다. 종료일을 고정 종료일로 지정합니다.",
  offline:
    "수강권 없이 좌석으로 운영합니다. 강의실·모집 정원·접수기간·출결은 현장강의 단계에서 추가됩니다.",
  blended:
    "현장 좌석 + 온라인 수강권을 하나의 신청으로 관리합니다(이행 분기는 현장강의 단계).",
  package_term:
    "정해진 기간에 운영되는 여러 강의를 하나로 묶습니다. 구성 강의를 다중 선택하고 종료일을 고정합니다.",
  package_always:
    "여러 온라인 강의를 묶어 수강신청일부터 수강일수로 셉니다(예: T-PASS).",
};

/**
 * 유형 → 등록 폼 규칙.
 * ★plannedSessions 를 정규(term)·현장에서 숨기고 서버가 null 로 강제하는 이유:
 *   `refundCalcTypeOf` 는 plannedSessions>0 이고 강의 1개면 'single'(회차 계산)로 판정한다.
 *   기간제 유형에 회차를 노출하면 다음 주문부터 기간제 계산이 단과 계산으로 조용히 바뀐다.
 */
export function courseFormatFormRules(format: CourseFormat): CourseFormatFormRules {
  const online = hasOnlineDelivery(format);
  const seat = needsSeat(format);
  const cadence = cadenceOf(format);
  // 수강기간 방식: 상시=일수 고정 · 정규=종료일 고정 · 혼합=선택 · 현장=정책 없음(무관)
  const durationMode: DurationModeRule = !online
    ? "any"
    : format === "blended"
      ? "any"
      : cadence === "always"
        ? "days"
        : "fixed";
  // 회차: 온라인 상시만 필수(요청서 11-8) · 패키지 상시·혼합은 선택 · 정규·현장은 숨김
  const plannedSessions: PlannedSessionsRule =
    format === "online_always"
      ? "required"
      : format === "package_always" || format === "blended"
        ? "optional"
        : "hidden";
  // 정책 그룹(feat-11-015 P3-c): 배수·일시정지·연장은 「온라인 수강권이 나가는 단과(혼합 포함)」에만 —
  //   패키지는 구성 강의의 단과 상품 정책을 따르므로(D17) 자기 폼에서 뺀다. 기기/다운로드는 전역 DRM 정책(D18)이라
  //   어느 유형에도 두지 않는다(B3) — 되살릴 일이 생기면 이 한 줄만 바꾼다.
  const singleOnline = online && !isPackageFormat(format);
  const policyGroups: PolicyGroupRules = {
    multiplier: singleOnline,
    device: false,
    pause: singleOnline,
    extension: singleOnline,
  };
  return {
    durationMode,
    showOnlinePolicy: online,
    showCourses: online,
    plannedSessions,
    showSchedules: seat,
    termFields: durationMode === "fixed",
    policyGroups,
    coursesLabel: isPackageFormat(format)
      ? "패키지 구성 강의(다중 선택)"
      : "연결 강의(에디션)",
    hint: FORM_HINT[format],
  };
}
