// feat-8-027 회원 등급 리졸버 (SSOT).
// 등급은 profiles 에 별도 컬럼으로 저장하지 않고, 아래 권위 신호로 매 요청 파생한다:
//   staff 역할 > 활성 cohort 멤버(종류별 범위) > 활성 자기학습 구독(과목별) > 체험(가입 15일 내) > 무료회원.
// 권한 게이트이므로 RLS 공백을 피하려 adminClient 로 권위 조회한다(요청자 본인 id 로 필터).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { redirect } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { getStaffRole } from "~/features/laws/queries.server";

export type MembershipGrade =
  | "staff"
  | "cohort"
  | "self_study"
  | "trial"
  | "free_member";

// 자기학습 등급은 자연과학을 결제 없이 기본 열람.
export const DEFAULT_SELF_STUDY_SUBJECT = "science";
// 체험(가입 후 15일) 열람 가능 학습과목 — 특허법만.
export const TRIAL_SUBJECTS: readonly string[] = ["patent"];
// feat-8-028 — 자기학습 상품 종류(개별 과목 / 번들). 이 상품 구독 시 grade=self_study,
//   부여 과목 = plan.subject_codes 합집합(+ 자연과학).
const SELF_STUDY_PRODUCT_KINDS = ["subject", "bundle"];
// 자기학습 등급의 area 기능 세트(체험·폴백 공용). 상품 features 와 동일하게 시드됨.
const SELF_STUDY_FEATURES = [
  "area_subjects",
  "area_study_aids",
  "area_study_mgmt",
  "passer_benchmarks",
  "passer_trend",
  "passer_summaries",
  "weak_node_guide",
  "recommended_actions",
  "base_learning",
];

export interface MembershipAccess {
  grade: MembershipGrade;
  /** 표시·요금제용 플랜 코드. */
  planCode: string;
  /** 유효 기능 플래그(area_*, passer_* 등). requireFeature 게이트 기준. */
  features: string[];
  /** area_subjects 로 열람 가능한 학습과목 — 'all' 또는 slug 목록(+ 'science'). */
  subjects: "all" | string[];
  /** 체험 등급일 때 만료 시각. */
  trialEndsAt: string | null;
}

const admin = adminClient as SupabaseClient<Database>;

// 플랜 코드 → features 배열 (subscription_plans SSOT). 캐시 없이 매번 조회(소량).
async function planFeatures(code: string): Promise<string[]> {
  const { data } = await admin
    .from("subscription_plans")
    .select("features")
    .eq("code", code)
    .maybeSingle();
  return Array.isArray(data?.features) ? (data.features as string[]) : [];
}

// 등급 체험 테스트 오버라이드(profiles.membership_test_grade) → 합성 access.
// staff 역할일 때만 호출되므로 학생이 컬럼을 조작해도 효과 없음.
//   'trial' | 'free_member' | 'cohort' | 'plan:<plan_code>'
async function synthesizeTestAccess(
  override: string,
): Promise<MembershipAccess | null> {
  if (override === "trial") {
    return {
      grade: "trial",
      planCode: "free",
      features: [...SELF_STUDY_FEATURES],
      subjects: [...TRIAL_SUBJECTS],
      trialEndsAt: new Date(Date.now() + 15 * 86_400_000).toISOString(),
    };
  }
  if (override === "free_member") {
    return {
      grade: "free_member",
      planCode: "free",
      features: await planFeatures("free"),
      subjects: [],
      trialEndsAt: null,
    };
  }
  if (override === "cohort") {
    return {
      grade: "cohort",
      planCode: "cohort",
      features: await planFeatures("cohort"),
      subjects: "all",
      trialEndsAt: null,
    };
  }
  if (override.startsWith("plan:")) {
    const code = override.slice("plan:".length);
    const { data: plan } = await admin
      .from("subscription_plans")
      .select("product_kind, subject_codes, features")
      .eq("code", code)
      .maybeSingle();
    if (!plan || !SELF_STUDY_PRODUCT_KINDS.includes(plan.product_kind)) {
      return null;
    }
    const subjects = new Set<string>(
      Array.isArray(plan.subject_codes) ? (plan.subject_codes as string[]) : [],
    );
    subjects.add(DEFAULT_SELF_STUDY_SUBJECT);
    const feats = Array.isArray(plan.features)
      ? (plan.features as string[])
      : [];
    return {
      grade: "self_study",
      planCode: "self_study",
      features: feats.length > 0 ? feats : [...SELF_STUDY_FEATURES],
      subjects: [...subjects],
      trialEndsAt: null,
    };
  }
  return null;
}

// 사용자의 유효 등급·기능·과목을 파생.
export async function getMembershipAccess(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<MembershipAccess> {
  // 1) staff — 구독 게이팅 면제(전체). 단, 등급 체험 테스트 오버라이드가 설정돼
  //    있으면 해당 등급의 access 를 합성해 학생 화면을 그대로 재현한다.
  const role = await getStaffRole(client, userId);
  if (role) {
    const { data: prof } = await admin
      .from("profiles")
      .select("membership_test_grade")
      .eq("profile_id", userId)
      .maybeSingle();
    if (prof?.membership_test_grade) {
      const synthesized = await synthesizeTestAccess(prof.membership_test_grade);
      if (synthesized) return synthesized;
    }
    return {
      grade: "staff",
      planCode: "cohort",
      features: await planFeatures("cohort"),
      subjects: "all",
      trialEndsAt: null,
    };
  }

  const nowIso = new Date().toISOString();

  // 2) 활성 cohort 멤버 — 종합반. 종류(access_scope)별 범위: full=전체 / self_study=자기학습 수준.
  const { data: cm } = await admin
    .from("cohort_members")
    .select("cohort_id, cohorts!inner(access_scope, is_archived, deleted_at)")
    .eq("profile_id", userId);
  const activeCohorts = (cm ?? []).filter(
    (r) => r.cohorts && !r.cohorts.is_archived && r.cohorts.deleted_at === null,
  );
  if (activeCohorts.length > 0) {
    const anyFull = activeCohorts.some((r) => r.cohorts.access_scope === "full");
    return {
      grade: "cohort",
      planCode: "cohort",
      // full=종합반 전체 기능 / self_study=자기학습 수준 기능.
      features: anyFull ? await planFeatures("cohort") : [...SELF_STUDY_FEATURES],
      subjects: "all",
      trialEndsAt: null,
    };
  }

  // 3) 활성 자기학습 상품 구독(개별 과목 / 번들). 부여 과목 = plan.subject_codes 합집합.
  //    ★dunning 유예(grace_until) 중에는 만료(expires_at 경과)여도 접근 유지 — 자동결제
  //    실패 재시도 기간 동안 학습이 끊기지 않도록. 유예까지 지나면 자연 차단.
  const { data: subs } = await admin
    .from("user_subscriptions")
    .select(
      "subject_code, expires_at, grace_until, subscription_plans!inner(product_kind, subject_codes, features)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .or(`expires_at.gte.${nowIso},grace_until.gte.${nowIso}`);
  const selfSubs = (subs ?? []).filter((s) =>
    SELF_STUDY_PRODUCT_KINDS.includes(s.subscription_plans.product_kind),
  );
  if (selfSubs.length > 0) {
    const subjectSet = new Set<string>();
    const featureSet = new Set<string>();
    for (const s of selfSubs) {
      const codes = Array.isArray(s.subscription_plans.subject_codes)
        ? (s.subscription_plans.subject_codes as string[])
        : [];
      for (const c of codes) subjectSet.add(c);
      // 레거시 폴백: 상품이 subject_codes 를 안 가지면 결제 시 태깅한 subject_code 사용.
      if (codes.length === 0 && s.subject_code) subjectSet.add(s.subject_code);
      const feats = Array.isArray(s.subscription_plans.features)
        ? (s.subscription_plans.features as string[])
        : [];
      for (const f of feats) featureSet.add(f);
    }
    subjectSet.add(DEFAULT_SELF_STUDY_SUBJECT); // 자연과학 기본 활성
    return {
      grade: "self_study",
      planCode: "self_study",
      features: featureSet.size > 0 ? [...featureSet] : [...SELF_STUDY_FEATURES],
      subjects: [...subjectSet],
      trialEndsAt: null,
    };
  }

  // 4) 체험 — 가입 후 15일 이내. 자기학습 수준 기능 + 학습과목=특허법만.
  const { data: prof } = await admin
    .from("profiles")
    .select("trial_ends_at")
    .eq("profile_id", userId)
    .maybeSingle();
  const trialEndsAt = prof?.trial_ends_at ?? null;
  if (trialEndsAt && trialEndsAt > nowIso) {
    return {
      grade: "trial",
      planCode: "free",
      features: [...SELF_STUDY_FEATURES],
      subjects: [...TRIAL_SUBJECTS],
      trialEndsAt,
    };
  }

  // 5) 무료회원 — 커뮤니티(반별 제외)+학습정보. 학습과목 제외(features 에 area_subjects 없음).
  return {
    grade: "free_member",
    planCode: "free",
    features: await planFeatures("free"),
    subjects: [],
    trialEndsAt,
  };
}

// 학습과목(조문·판례·문제) 과목별 게이트 — /subjects/:subject 진입 loader 에서 호출.
// 체험=특허법만, 자기학습=결제 과목(+자연과학), 종합반/staff=전체, 무료회원=차단.
export async function requireSubject(
  client: SupabaseClient<Database>,
  userId: string,
  subjectSlug: string,
): Promise<void> {
  const access = await getMembershipAccess(client, userId);
  if (access.grade === "staff") return;
  if (!access.features.includes("area_subjects")) {
    throw redirect(`/pricing?locked=area_subjects`);
  }
  if (access.subjects === "all") return;
  if (!access.subjects.includes(subjectSlug)) {
    throw redirect(`/pricing?locked=${encodeURIComponent(`subject:${subjectSlug}`)}`);
  }
}
