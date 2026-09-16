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

/** 목록·필터에서 세 축 라벨을 한 줄로: "온라인 · 단과 · 상시". */
export function describeCourseFormatAxes(format: CourseFormat): string {
  return [
    DELIVERY_LABEL[deliveryOf(format)],
    PACKAGING_LABEL[packagingOf(format)],
    CADENCE_LABEL[cadenceOf(format)],
  ].join(" · ");
}
