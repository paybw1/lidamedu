// 반 소유권 게이트 — staff API 의 유일한 방어선이다(계획 테이블 RLS 는 is_staff 로
// 넓게 열려 있고, "어느 반이냐"는 여기서만 판정한다).
//
// ★라우트 모듈에 두면 안 된다 — loader/action 이 아닌 export 가 서버 모듈을
//   끌어와 클라이언트 번들 빌드가 깨진다(typecheck 는 통과하므로 build 로만 잡힌다).
import adminClient from "~/core/lib/supa-admin-client.server";
import { roleAtLeast, type UserRole } from "~/core/lib/roles";
import { getCohortById } from "~/features/cohorts/queries.server";

export type CohortGateResult =
  | { cohortId: string }
  | { error: string; status: number };

/**
 * ★planId 가 있으면 **폼의 cohortId 를 믿지 않는다**. 믿으면 "자기 반 id + 남의 반
 *   planId" 조합으로 통과해 남의 학생 계획을 고칠 수 있다 — 편집 폼이 두 값을 함께
 *   보내므로 실제로 가능한 조합이다. 계획 행에서 역추적한 값만 쓴다.
 */
export async function resolveCohortGate(input: {
  role: UserRole;
  userId: string;
  formCohortId: string;
  planId: string;
}): Promise<CohortGateResult> {
  let cohortId = input.formCohortId;
  if (input.planId) {
    const { data: p } = await adminClient
      .from("study_plans")
      .select("cohort_id")
      .eq("plan_id", input.planId)
      .maybeSingle();
    cohortId = p?.cohort_id ?? "";
  }
  if (!cohortId) return { error: "대상을 찾을 수 없습니다", status: 404 };
  if (!roleAtLeast(input.role, "manager")) {
    const cohort = await getCohortById(adminClient, cohortId);
    if (!cohort || cohort.ownerId !== input.userId) {
      return { error: "본인 소유 반만 접근 가능합니다", status: 403 };
    }
  }
  return { cohortId };
}
