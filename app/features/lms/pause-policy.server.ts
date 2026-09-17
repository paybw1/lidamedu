// 수강권별 일시정지 정책 해석 — feat-11-015 D17 (원장 결정 2026-09-17).
//
// ★패키지 수강권은 패키지 자신의 plan_policies.pause_* 를 **절대 읽지 않는다**(운영 pt_tpass 의 저장값
//   pause_allowed=true 가 새면 안 됨). 수강권의 강의(course_id)에 연결된 「단과 상품」을
//   pickSingleCoursePlan 으로 골라 그 상품의 정책을 쓴다. 단과 상품이 없으면 source 'none'(불가).
// ★패키지가 아닌 수강권은 종전대로 자기 상품 정책('own'). course_format 이 null 인 학습 구독·구법 상품도 여기.
// ★화면(my-courses 로더)과 서버 검증(pause_request 액션)이 **이 함수 하나**를 함께 쓴다 —
//   두 판정이 갈리면 "버튼은 안 보이는데 요청은 통과하는" 구멍이 생긴다.
// 조회는 adminClient 배치(.in) — 수강권 N개에 대해 쿼리 4회(왕복 3회) 이내.

import adminClient from "~/core/lib/supa-admin-client.server";
import { isPackageFormat, toCourseFormat } from "~/features/lms/lib/course-format";
import {
  pickSingleCoursePlan,
  type SingleCoursePlanCandidate,
} from "~/features/lms/lib/single-course-plan";

export type PausePolicySource = "own" | "single_course" | "none";

export interface ResolvedPausePolicy {
  pauseAllowed: boolean;
  totalDays: number;
  maxCount: number;
  minDays: number;
  maxDays: number;
  /** own = 자기 상품 정책 · single_course = 구성 강의의 단과 상품 정책 · none = 기준 상품 없음(불가). */
  source: PausePolicySource;
}

export interface PausePolicyEnrollmentInput {
  enrollmentId: string;
  planId: string | null;
  courseId: string | null;
}

const NO_PAUSE: Omit<ResolvedPausePolicy, "source"> = {
  pauseAllowed: false,
  totalDays: 0,
  maxCount: 0,
  minDays: 0,
  maxDays: 0,
};

/**
 * 수강권 목록의 일시정지 정책을 한 번에 해석한다. 입력한 모든 수강권에 대해 항목을 돌려준다.
 * - plan 이 패키지 유형 → course_id 로 단과 상품을 골라 그 정책('single_course'), 없으면 'none'.
 * - 그 밖(plan_id 없음·course_format null·단과·현장·혼합) → 자기 정책('own'), 정책 행 없으면 불가.
 * - 상품 유형 조회(①)가 실패하면 throw — 유형을 모르는 채 자기 행을 읽으면 패키지 정책이 새므로
 *   닫힌 쪽으로 끝낸다. 호출자(로더·액션)가 잡아 "불가" 로 처리한다.
 */
export async function resolvePausePolicies(
  enrollments: readonly PausePolicyEnrollmentInput[],
): Promise<Map<string, ResolvedPausePolicy>> {
  const out = new Map<string, ResolvedPausePolicy>();
  if (enrollments.length === 0) return out;

  const ownPlanIds = [
    ...new Set(enrollments.map((e) => e.planId).filter((v): v is string => !!v)),
  ];
  const courseIds = [
    ...new Set(enrollments.map((e) => e.courseId).filter((v): v is string => !!v)),
  ];

  // ① 자기 상품의 유형 ∥ ② 강의에 연결된 상품(후보) — 서로 독립이라 병렬.
  const [ownPlansRes, linksRes] = await Promise.all([
    ownPlanIds.length > 0
      ? adminClient
          .from("subscription_plans")
          .select("plan_id, course_format")
          .in("plan_id", ownPlanIds)
      : Promise.resolve({
          data: [] as { plan_id: string; course_format: string | null }[],
          error: null,
        }),
    courseIds.length > 0
      ? adminClient
          .from("plan_courses")
          .select("plan_id, course_id")
          .in("course_id", courseIds)
      : Promise.resolve({ data: [] as { plan_id: string; course_id: string }[] }),
  ]);
  // ★① 이 실패하면 어느 수강권이 패키지인지 알 수 없다 — 모르는 채 자기 행을 읽으면 패키지 자기
  //   pause_* 가 새는 fail-open 이라 여기서 닫힌 쪽으로 끝낸다(호출자가 잡아 "불가" 로 그린다).
  if (ownPlansRes.error) {
    throw new Error(`일시정지 정책 해석 실패(상품 유형 조회): ${ownPlansRes.error.message}`);
  }
  // 3상태: true=패키지 · false=패키지 아님 · (없음)=상품 행 없음/미분류 → 어느 분기도 plan_policies 를 읽지 않는다.
  const isPackagePlan = new Map<string, boolean>();
  for (const p of ownPlansRes.data ?? []) {
    const format = toCourseFormat(p.course_format);
    isPackagePlan.set(p.plan_id, format !== null && isPackageFormat(format));
  }
  const candidateIdsByCourse = new Map<string, string[]>();
  for (const l of linksRes.data ?? []) {
    const arr = candidateIdsByCourse.get(l.course_id) ?? [];
    arr.push(l.plan_id);
    candidateIdsByCourse.set(l.course_id, arr);
  }

  // 패키지 수강권의 강의에 연결된 후보 상품만 유형·판매상태를 조회한다.
  const packageCourseIds = new Set<string>();
  for (const e of enrollments) {
    if (e.planId && e.courseId && isPackagePlan.get(e.planId) === true) {
      packageCourseIds.add(e.courseId);
    }
  }
  const candidatePlanIds = [
    ...new Set(
      [...packageCourseIds].flatMap((cid) => candidateIdsByCourse.get(cid) ?? []),
    ),
  ];
  // ③ 후보 상품 행
  const candidateById = new Map<string, SingleCoursePlanCandidate>();
  if (candidatePlanIds.length > 0) {
    const { data: plans } = await adminClient
      .from("subscription_plans")
      .select("plan_id, course_format, product_kind, sale_status, created_at")
      .in("plan_id", candidatePlanIds);
    for (const p of plans ?? []) {
      candidateById.set(p.plan_id, {
        planId: p.plan_id,
        courseFormat: p.course_format,
        productKind: p.product_kind,
        saleStatus: p.sale_status,
        createdAt: p.created_at,
      });
    }
  }
  const singlePlanByCourse = new Map<string, string | null>();
  for (const cid of packageCourseIds) {
    const candidates = (candidateIdsByCourse.get(cid) ?? [])
      .map((pid) => candidateById.get(pid))
      .filter((c): c is SingleCoursePlanCandidate => !!c);
    singlePlanByCourse.set(cid, pickSingleCoursePlan(candidates));
  }

  // 정책을 읽을 상품 = 「패키지 아님」으로 확인된 자기 상품 ∪ 골라진 단과 상품.
  //   ★패키지 자기 상품과 유형 미확인(①에 행 없음) 상품은 이 집합에 들어가지 않는다 — 어느 분기도
  //   그 행을 읽을 수 없다(구조적 차단). truthy 검사로 쓰면 미확인이 'own' 으로 새므로 === 로 가른다.
  const policyPlanIds = new Set<string>();
  for (const e of enrollments) {
    if (!e.planId) continue;
    const pkg = isPackagePlan.get(e.planId);
    if (pkg === true) {
      const picked = e.courseId ? singlePlanByCourse.get(e.courseId) : null;
      if (picked) policyPlanIds.add(picked);
    } else if (pkg === false) {
      policyPlanIds.add(e.planId);
    }
  }
  // ④ 정책 행
  const policyByPlan = new Map<string, Omit<ResolvedPausePolicy, "source">>();
  if (policyPlanIds.size > 0) {
    const { data: policies } = await adminClient
      .from("plan_policies")
      .select(
        "plan_id, pause_allowed, pause_total_days, pause_max_count, pause_min_days, pause_max_days",
      )
      .in("plan_id", [...policyPlanIds]);
    for (const p of policies ?? []) {
      policyByPlan.set(p.plan_id, {
        pauseAllowed: p.pause_allowed,
        totalDays: p.pause_total_days,
        maxCount: p.pause_max_count,
        minDays: p.pause_min_days,
        maxDays: p.pause_max_days,
      });
    }
  }

  for (const e of enrollments) {
    const pkg = e.planId ? isPackagePlan.get(e.planId) : undefined;
    if (pkg === true) {
      const picked = e.courseId ? (singlePlanByCourse.get(e.courseId) ?? null) : null;
      if (!picked) {
        out.set(e.enrollmentId, { ...NO_PAUSE, source: "none" });
        continue;
      }
      out.set(e.enrollmentId, {
        ...(policyByPlan.get(picked) ?? NO_PAUSE),
        source: "single_course",
      });
      continue;
    }
    // pkg === false → 자기 정책. pkg 미확인(plan_id 없음·상품 행 없음) → 정책을 읽지 않았으니 불가.
    out.set(e.enrollmentId, {
      ...((pkg === false && e.planId && policyByPlan.get(e.planId)) || NO_PAUSE),
      source: "own",
    });
  }
  return out;
}
