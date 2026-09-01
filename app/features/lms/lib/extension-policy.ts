// feat-11-010 — 수강기간 연장 정책 해석 (요청서_0901 §3).
//
// ★client-safe SSOT. 버튼 노출 판정(화면)과 결제 생성 재검증(서버)이 **같은 함수**를
//   써야 한다. 두 곳에 따로 적으면 반드시 어긋나고, 어긋나는 쪽은 늘 서버가 아니라
//   "버튼은 안 보이는데 URL 로는 되는" 쪽이다.
// `.server` 를 import 하지 않는다(메모: build-server-in-client).

/** 종료 후 연장 가능 기간 — 요청서 §3 "종료 후 30일 이내". */
export const EXTENSION_GRACE_DAYS = 30;

const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 3_600_000;

/** 운영 기본값(app_settings). 강의별 값이 NULL 이면 이걸 쓴다. */
export interface ExtensionDefaults {
  enabled: boolean;
  priceKrw: number;
  /** 0 = 무제한 */
  maxCount: number;
  /** 0 = 강의 기본 학습일수(duration_days) */
  days: number;
}

/** 설정이 하나도 없을 때의 값 — **꺼진 상태**가 안전한 기본이다. */
export const EXTENSION_DEFAULTS_FALLBACK: ExtensionDefaults = {
  enabled: false,
  priceKrw: 0,
  maxCount: 0,
  days: 30,
};

/** plan_policies + subscription_plans 에서 읽어 온 강의별 설정(NULL = 기본값 따름). */
export interface PlanExtensionInput {
  productKind: string | null;
  extensionAllowed: boolean | null;
  extensionPriceKrw: number | null;
  extensionMaxCount: number | null;
  extensionDays: number | null;
  /** 강의 기본 학습일수 — extensionDays 가 0 일 때 대신 쓴다. */
  durationDays: number | null;
}

export interface ResolvedExtensionPolicy {
  enabled: boolean;
  priceKrw: number;
  /** 0 = 무제한 */
  maxCount: number;
  /** 실제 적용 일수(0 이 남지 않도록 이미 풀어 둔 값). */
  days: number;
}

/** 연장 대상은 온라인 단과뿐 — 현장강의·패키지(tpass)는 요청서가 "불필요" 로 명시. */
export const EXTENDABLE_PRODUCT_KIND = "course";

export function resolveExtensionPolicy(
  plan: PlanExtensionInput,
  defaults: ExtensionDefaults,
): ResolvedExtensionPolicy {
  const enabled = plan.extensionAllowed ?? defaults.enabled;
  const priceKrw = plan.extensionPriceKrw ?? defaults.priceKrw;
  const maxCount = plan.extensionMaxCount ?? defaults.maxCount;
  const rawDays = plan.extensionDays ?? defaults.days;
  // 0 = "강의 기본 학습일수". 그것마저 없으면 기본값의 일수로 떨어진다.
  const days = rawDays > 0 ? rawDays : (plan.durationDays ?? defaults.days);
  return { enabled, priceKrw, maxCount, days };
}

/** 연장을 막는 이유 — 화면 문구와 서버 거절 사유가 같은 값을 쓴다. */
export type ExtensionBlockReason =
  | "not_course"
  | "disabled"
  | "no_price"
  | "revoked"
  | "max_count"
  | "grace_expired";

export const EXTENSION_BLOCK_MESSAGE: Record<ExtensionBlockReason, string> = {
  not_course: "온라인 단과강의만 연장할 수 있습니다.",
  disabled: "이 강의는 수강기간 연장을 제공하지 않습니다.",
  no_price: "연장 금액이 설정되지 않았습니다.",
  revoked: "해지된 수강권은 연장할 수 없습니다.",
  max_count: "연장 가능 횟수를 모두 사용했습니다.",
  grace_expired: "수강 종료 후 30일이 지나 연장할 수 없습니다.",
};

export interface ExtensionOffer {
  ok: boolean;
  reason: ExtensionBlockReason | null;
  policy: ResolvedExtensionPolicy;
  /** 이미 사용한 연장 횟수(enrollment_extensions status=applied). */
  usedCount: number;
  /** 남은 횟수. 무제한이면 null. */
  remainingCount: number | null;
  /** 이미 종료됐는가(종료 후 연장 경로). */
  expired: boolean;
  /** 연장 신청 마감 시각(종료일 + 30일). ISO. */
  graceUntil: string;
  /** 결제 성공 시 될 새 만료일. ISO. */
  nextExpiresAt: string;
}

/**
 * KST 기준 "다음 날 0시" 의 실제 시각.
 * 종료 후 연장은 **결제 당일을 연장일수에 넣지 않는다** — 오늘은 덤으로 열어 주고
 * 내일 0시부터 N일을 센다(요청서 예시: 오늘 5일 결제 → 오늘 즉시 수강 → 내일부터 5일).
 */
export function startOfNextKstDay(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) -
      KST_OFFSET_MS,
  );
}

/** 연장 후 만료일 — 수강 중이면 종료일 뒤에 누적, 종료 후면 내일 0시 + N일. */
export function computeNextExpiry(
  now: Date,
  currentExpiresAt: Date,
  days: number,
): Date {
  if (currentExpiresAt.getTime() > now.getTime()) {
    return new Date(currentExpiresAt.getTime() + days * DAY_MS);
  }
  return new Date(startOfNextKstDay(now).getTime() + days * DAY_MS);
}

/**
 * 이 수강권을 지금 연장할 수 있는가 + 연장하면 어떻게 되는가.
 * ★화면(버튼)과 서버(주문 생성)가 **둘 다** 이 함수를 부른다.
 */
export function resolveExtensionOffer(input: {
  now: Date;
  plan: PlanExtensionInput;
  defaults: ExtensionDefaults;
  /** enrollments.status — revoked 면 연장 불가. */
  status: string;
  expiresAt: string;
  usedCount: number;
}): ExtensionOffer {
  const policy = resolveExtensionPolicy(input.plan, input.defaults);
  const expires = new Date(input.expiresAt);
  const graceUntil = new Date(expires.getTime() + EXTENSION_GRACE_DAYS * DAY_MS);
  const expired = expires.getTime() <= input.now.getTime();
  const remainingCount =
    policy.maxCount > 0 ? Math.max(0, policy.maxCount - input.usedCount) : null;
  const base = {
    policy,
    usedCount: input.usedCount,
    remainingCount,
    expired,
    graceUntil: graceUntil.toISOString(),
    nextExpiresAt: computeNextExpiry(input.now, expires, policy.days).toISOString(),
  };

  const deny = (reason: ExtensionBlockReason): ExtensionOffer => ({
    ...base,
    ok: false,
    reason,
  });

  if (input.plan.productKind !== EXTENDABLE_PRODUCT_KIND) return deny("not_course");
  if (!policy.enabled) return deny("disabled");
  if (policy.priceKrw <= 0) return deny("no_price");
  if (input.status === "revoked") return deny("revoked");
  if (remainingCount !== null && remainingCount <= 0) return deny("max_count");
  // 종료 후 30일이 지나면 불가. 수강 중이면 이 검사는 통과한다.
  if (expired && input.now.getTime() > graceUntil.getTime()) {
    return deny("grace_expired");
  }
  return { ...base, ok: true, reason: null };
}
