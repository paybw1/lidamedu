// 탈퇴 관리 (admin 전용) — 대장: 탈퇴 처리(계정 잠금) → 완전 삭제(auth 계정 제거).
// 이름·아이디·회원번호는 스냅샷으로 남겨 계정 삭제 후에도 이력이 유지된다.

import adminClient from "~/core/lib/supa-admin-client.server";

export interface WithdrawalRow {
  withdrawalId: string;
  userId: string | null;
  memberNo: number | null;
  userName: string | null;
  userLoginId: string | null;
  status: "withdrawn" | "deleted";
  withdrawnAt: string;
  withdrawnByName: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  reason: string | null;
}

export async function listWithdrawals(): Promise<WithdrawalRow[]> {
  const { data, error } = await adminClient
    .from("user_withdrawals")
    .select(
      "withdrawal_id, user_id, member_no, user_name, user_login_id, status, withdrawn_at, deleted_at, reason, withdrawn_by_profile:profiles!withdrawn_by(name), deleted_by_profile:profiles!deleted_by(name)",
    )
    .order("withdrawn_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    withdrawalId: r.withdrawal_id,
    userId: r.user_id,
    memberNo: r.member_no,
    userName: r.user_name,
    userLoginId: r.user_login_id,
    status: r.status as "withdrawn" | "deleted",
    withdrawnAt: r.withdrawn_at,
    withdrawnByName: r.withdrawn_by_profile?.name ?? null,
    deletedAt: r.deleted_at,
    deletedByName: r.deleted_by_profile?.name ?? null,
    reason: r.reason,
  }));
}

/** 탈퇴 처리 — 스냅샷 기록 + 이용 승인 해제(즉시 접속 차단). 계정·학습 데이터는 보존. */
export async function processWithdrawal(
  userId: string,
  reason: string | null,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: prof } = await adminClient
    .from("profiles")
    .select("profile_id, member_no, name, role")
    .eq("profile_id", userId)
    .maybeSingle();
  if (!prof) return { ok: false, error: "회원을 찾을 수 없습니다." };
  if (prof.role !== "student")
    return { ok: false, error: "학생 계정만 탈퇴 처리할 수 있습니다." };
  const { data: existing } = await adminClient
    .from("user_withdrawals")
    .select("withdrawal_id")
    .eq("user_id", userId)
    .eq("status", "withdrawn")
    .maybeSingle();
  if (existing) return { ok: false, error: "이미 탈퇴 처리된 회원입니다." };

  let email: string | null = null;
  try {
    const { data: au } = await adminClient.auth.admin.getUserById(userId);
    email = au.user?.email ?? null;
  } catch {
    // email 조회 실패해도 진행.
  }
  const { error: insErr } = await adminClient.from("user_withdrawals").insert({
    user_id: userId,
    member_no: prof.member_no,
    user_name: prof.name,
    user_login_id: email,
    status: "withdrawn",
    withdrawn_by: actorId,
    reason,
  });
  if (insErr) return { ok: false, error: insErr.message };
  // 즉시 접속 차단 — 승인 해제 (게이트 requireAccessApproval).
  const { error: upErr } = await adminClient
    .from("profiles")
    .update({ access_approved_at: null })
    .eq("profile_id", userId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

/** 탈퇴 취소 — 대장 행 제거 + 이용 재승인. */
export async function cancelWithdrawal(
  withdrawalId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: w } = await adminClient
    .from("user_withdrawals")
    .select("withdrawal_id, user_id, status")
    .eq("withdrawal_id", withdrawalId)
    .maybeSingle();
  if (!w) return { ok: false, error: "대상 없음" };
  if (w.status !== "withdrawn")
    return { ok: false, error: "삭제 완료된 건은 취소할 수 없습니다." };
  if (w.user_id) {
    await adminClient
      .from("profiles")
      .update({ access_approved_at: new Date().toISOString() })
      .eq("profile_id", w.user_id);
  }
  const { error } = await adminClient
    .from("user_withdrawals")
    .delete()
    .eq("withdrawal_id", withdrawalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 완전 삭제 — auth 계정 제거(프로필·학습 데이터 cascade). 비가역. */
export async function deleteWithdrawnUser(
  withdrawalId: string,
  actorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: w } = await adminClient
    .from("user_withdrawals")
    .select("withdrawal_id, user_id, status")
    .eq("withdrawal_id", withdrawalId)
    .maybeSingle();
  if (!w) return { ok: false, error: "대상 없음" };
  if (w.status !== "withdrawn")
    return { ok: false, error: "이미 삭제된 건입니다." };
  if (!w.user_id) return { ok: false, error: "연결된 계정이 없습니다." };
  const { error: delErr } = await adminClient.auth.admin.deleteUser(w.user_id);
  if (delErr) return { ok: false, error: `계정 삭제 실패: ${delErr.message}` };
  const { error } = await adminClient
    .from("user_withdrawals")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: actorId,
    })
    .eq("withdrawal_id", withdrawalId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
