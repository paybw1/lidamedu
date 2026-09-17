// 「연장 상품」 진입점 게이트 — feat-11-015 D17 (패키지 연장 원천 거절, 원장 결정 2026-09-17).
//
// 내 강의실(my-courses 로더)의 옛 진입점은 plan_policies.extension_allowed/extension_plan_ids 만 보고
// 연장 상품을 노출했다 — 상품 종류·유형 게이트가 없어 패키지 상품 행에 연장 값이 들어가면 그대로 샌다.
// 새 유료 연장(extension-policy.ts)은 product_kind='course' 만, 일시정지(pause-policy.server.ts)는
// 패키지를 구조적으로 막는다. 이 함수가 옛 진입점을 같은 기준으로 닫는다.
//
// 클라·서버 공용(서버 import 없음). 판정 규칙만 갖고 DB 조회는 호출자(로더)가 한다.
import { isPackageFormat, toCourseFormat } from "./course-format";
import { EXTENDABLE_PRODUCT_KIND } from "./extension-policy";

export interface ExtensionEntryInput {
  /** subscription_plans.product_kind — 상품 행을 못 찾았으면 null(→ 불가). */
  productKind: string | null;
  /** subscription_plans.course_format — 강의상품만 값, 학습 구독·구법 상품은 null. */
  courseFormat: string | null;
}

/**
 * 이 상품의 수강권에 「연장 상품」 진입점을 열어도 되는가.
 * - product_kind 가 'course' 가 아니면(tpass·구독·행 없음) 불가.
 * - course_format 이 패키지 유형(package_term/package_always)이면 불가.
 * - course_format 이 null(구법 course 상품)이면 종전대로 허용 — 유형을 모르는 것이지 패키지는 아니다.
 */
export function canOfferExtensionEntry(input: ExtensionEntryInput): boolean {
  if (input.productKind !== EXTENDABLE_PRODUCT_KIND) return false;
  const format = toCourseFormat(input.courseFormat);
  if (format !== null && isPackageFormat(format)) return false;
  return true;
}
