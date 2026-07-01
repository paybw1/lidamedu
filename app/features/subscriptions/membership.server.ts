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
// 자기학습 플랜 코드(레거시 'pro_monthly' 유지). 신규 'self_study' 코드도 동일 취급.
const SELF_STUDY_PLAN_CODES = ["pro_monthly", "self_study"];

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

// 사용자의 유효 등급·기능·과목을 파생.
export async function getMembershipAccess(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<MembershipAccess> {
  // 1) staff — 구독 게이팅 면제(전체).
  const role = await getStaffRole(client, userId);
  if (role) {
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
    const featureCode = anyFull ? "cohort" : SELF_STUDY_PLAN_CODES[0];
    return {
      grade: "cohort",
      planCode: "cohort",
      features: await planFeatures(featureCode),
      subjects: "all",
      trialEndsAt: null,
    };
  }

  // 3) 활성 자기학습 구독(과목별). subject_code null = 전체(레거시/whole).
  const { data: subs } = await admin
    .from("user_subscriptions")
    .select("subject_code, subscription_plans!inner(code)")
    .eq("user_id", userId)
    .eq("status", "active")
    .gte("expires_at", nowIso);
  const selfSubs = (subs ?? []).filter((s) =>
    SELF_STUDY_PLAN_CODES.includes(s.subscription_plans.code),
  );
  if (selfSubs.length > 0) {
    let subjects: "all" | string[];
    if (selfSubs.some((s) => !s.subject_code)) {
      subjects = "all";
    } else {
      const set = new Set<string>();
      for (const s of selfSubs) if (s.subject_code) set.add(s.subject_code);
      set.add(DEFAULT_SELF_STUDY_SUBJECT); // 자연과학 기본 활성
      subjects = [...set];
    }
    return {
      grade: "self_study",
      planCode: SELF_STUDY_PLAN_CODES[0],
      features: await planFeatures(SELF_STUDY_PLAN_CODES[0]),
      subjects,
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
      features: await planFeatures(SELF_STUDY_PLAN_CODES[0]),
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
