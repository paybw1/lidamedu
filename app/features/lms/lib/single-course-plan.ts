// 「구성 강의의 단과 상품」 선택 규칙 — feat-11-015 D17 (원장 결정 2026-09-17).
//
// 패키지 수강권의 일시정지 정책은 패키지 자신의 plan_policies 가 아니라, 그 수강권의 강의(course_id)에
// plan_courses 로 연결된 **단과 상품**(강의개설 목록의 product_kind='course' · 패키지가 아닌 온라인 유형)의
// plan_policies 를 따른다. 이 파일은 후보 상품 목록에서 「어느 단과 상품인가」를 고르는 순수 규칙만 갖는다.
// 서버 래퍼(DB 조회)는 pause-policy.server.ts.
//
// 클라·서버 공용(서버 import 없음) — 안내 문구를 로더·액션·화면이 같은 상수로 쓴다.

import {
  hasOnlineDelivery,
  isPackageFormat,
  toCourseFormat,
} from "./course-format";

/** 단과 상품이 하나도 없어 일시정지가 불가할 때 학생에게 보이는 안내(D17). */
export const PAUSE_NO_SINGLE_COURSE_PLAN_NOTICE =
  "구성 강의의 단과 상품 정책이 없어 일시정지할 수 없습니다.";

/** 단과 상품 후보 — plan_courses 로 강의에 연결된 subscription_plans 한 행. */
export interface SingleCoursePlanCandidate {
  planId: string;
  /** subscription_plans.course_format — 강의상품만 값, 학습 구독은 null. */
  courseFormat: string | null;
  productKind: string;
  saleStatus: string;
  /** subscription_plans.created_at — ISO 8601(Postgres 출력: 소수초 후행 0 절삭, `+00:00`). */
  createdAt: string;
  // ★삭제 칸은 없다 — subscription_plans 에 deleted_at 컬럼이 없고 상품 삭제는 hard delete +
  //   plan_courses cascade 라 삭제된 상품은 애초에 후보(plan_courses 연결)에 오르지 못한다.
}

const PRODUCT_KIND_COURSE = "course";
const SALE_STATUS_ON_SALE = "on_sale";

/** 후보가 「단과 상품」인가 — course 상품 · 패키지가 아닌 온라인 유형. */
export function isSingleCoursePlanCandidate(
  c: SingleCoursePlanCandidate,
): boolean {
  if (c.productKind !== PRODUCT_KIND_COURSE) return false;
  const format = toCourseFormat(c.courseFormat);
  if (!format) return false;
  return !isPackageFormat(format) && hasOnlineDelivery(format);
}

/**
 * created_at 최신 우선 비교(내림차순). ★localeCompare 금지 — ICU 콜레이션은 '+' 를 '.' 뒤에 두어
 * `…33+00:00`(정확히 .000000, Postgres 가 후행 0 을 절삭) 이 `…33.5+00:00` 보다 "최신" 으로 잘못 잡힌다.
 * 밀리초 수치로 먼저 가르고, 같은 밀리초(마이크로초 차이)·파싱 불가면 코드포인트 비교로 가른다.
 */
function compareCreatedAtDesc(a: string, b: string): number {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return tb - ta;
  if (a === b) return 0;
  return b > a ? 1 : -1;
}

/**
 * 후보 중 정책 기준이 될 단과 상품 하나를 고른다.
 * 규칙: 단과 상품(위 술어) → sale_status 'on_sale' 우선 → created_at 최신.
 * 동률이면 planId 사전순(결정적 — 같은 시각에 만든 상품이 있어도 매번 같은 답).
 * 없으면 null(= 일시정지 불가, PAUSE_NO_SINGLE_COURSE_PLAN_NOTICE).
 */
export function pickSingleCoursePlan(
  candidates: readonly SingleCoursePlanCandidate[],
): string | null {
  const eligible = candidates.filter(isSingleCoursePlanCandidate);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => {
    const aOnSale = a.saleStatus === SALE_STATUS_ON_SALE ? 1 : 0;
    const bOnSale = b.saleStatus === SALE_STATUS_ON_SALE ? 1 : 0;
    if (aOnSale !== bOnSale) return bOnSale - aOnSale;
    const byCreated = compareCreatedAtDesc(a.createdAt, b.createdAt);
    if (byCreated !== 0) return byCreated;
    return a.planId.localeCompare(b.planId);
  });
  return sorted[0].planId;
}
