// feat-8-029 Stage 2 — 강사 배분 기준 쿼리. 호출부 manager+ 검증 필수, adminClient(RLS 우회).
// 규칙 적용: 결제 1건 × 강사별 — plan > subject > all 순으로 가장 구체적인 활성 규칙 1개.
// 동급이면 effective_from 최신. 수정은 "새 규칙 등록 + 기존 비활성" (정산 항목이 rule_id 를
// 참조하므로 규칙 값 in-place 변경은 지급 근거를 훼손 — 값 변경 대신 세대 교체).

import adminClient from "~/core/lib/supa-admin-client.server";

export type ShareTargetKind = "plan" | "subject" | "all";
export type ShareKind = "percent" | "fixed";

export interface ShareRule {
  ruleId: string;
  instructorId: string;
  instructorName: string | null;
  targetKind: ShareTargetKind;
  targetPlanId: string | null;
  targetPlanName: string | null;
  targetSubjectCode: string | null;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string;
  isActive: boolean;
  memo: string | null;
  createdAt: string;
}

const RULE_SELECT =
  "rule_id, instructor_id, target_kind, target_plan_id, target_subject_code, share_kind, share_value, effective_from, is_active, memo, created_at, profiles!instructor_id(name), subscription_plans(name)";

function rowToRule(r: {
  rule_id: string;
  instructor_id: string;
  target_kind: string;
  target_plan_id: string | null;
  target_subject_code: string | null;
  share_kind: string;
  share_value: number;
  effective_from: string;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  profiles: { name: string | null } | null;
  subscription_plans: { name: string } | null;
}): ShareRule {
  return {
    ruleId: r.rule_id,
    instructorId: r.instructor_id,
    instructorName: r.profiles?.name ?? null,
    targetKind: r.target_kind as ShareTargetKind,
    targetPlanId: r.target_plan_id,
    targetPlanName: r.subscription_plans?.name ?? null,
    targetSubjectCode: r.target_subject_code,
    shareKind: r.share_kind as ShareKind,
    shareValue: r.share_value,
    effectiveFrom: r.effective_from,
    isActive: r.is_active,
    memo: r.memo,
    createdAt: r.created_at,
  };
}

export async function listShareRules(opts?: {
  activeOnly?: boolean;
}): Promise<ShareRule[]> {
  let q = adminClient
    .from("instructor_share_rules")
    .select(RULE_SELECT)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(rowToRule);
}

export interface InstructorOption {
  profileId: string;
  name: string | null;
  role: string;
}

export async function listInstructorOptions(): Promise<InstructorOption[]> {
  const { data, error } = await adminClient
    .from("profiles")
    .select("profile_id, name, role")
    .in("role", ["instructor", "admin"])
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    profileId: r.profile_id,
    name: r.name,
    role: r.role,
  }));
}

export interface CreateShareRuleInput {
  instructorId: string;
  targetKind: ShareTargetKind;
  targetPlanId: string | null;
  targetSubjectCode: string | null;
  shareKind: ShareKind;
  shareValue: number;
  effectiveFrom: string; // YYYY-MM-DD
  memo: string | null;
  createdBy: string;
}

export async function createShareRule(
  input: CreateShareRuleInput,
): Promise<{ ok: true; ruleId: string } | { ok: false; error: string }> {
  if (input.shareKind === "percent" && (input.shareValue < 1 || input.shareValue > 100)) {
    return { ok: false, error: "정률은 1~100% 범위" };
  }
  if (input.shareValue <= 0) return { ok: false, error: "배분 값은 양수" };
  const { data, error } = await adminClient
    .from("instructor_share_rules")
    .insert({
      instructor_id: input.instructorId,
      target_kind: input.targetKind,
      target_plan_id: input.targetKind === "plan" ? input.targetPlanId : null,
      target_subject_code:
        input.targetKind === "subject" ? input.targetSubjectCode : null,
      share_kind: input.shareKind,
      share_value: input.shareValue,
      effective_from: input.effectiveFrom,
      memo: input.memo,
      created_by: input.createdBy,
    })
    .select("rule_id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "insert 실패" };
  return { ok: true, ruleId: data.rule_id };
}

export async function setShareRuleActive(
  ruleId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await adminClient
    .from("instructor_share_rules")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("rule_id", ruleId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
