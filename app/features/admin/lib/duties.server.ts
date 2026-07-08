// 운영 업무별 담당자 라우팅 (관리자 관리) — staff broadcast 알림의 수신자 결정 SSOT.
// 배정이 1명 이상이면 그 명단에만 발송, 0명이면 기존 전체 fanout(역할 폴백)으로
// fail-open — 담당자를 실수로 전부 해제해도 알림이 실종되지 않는다.

import adminClient from "~/core/lib/supa-admin-client.server";
import {
  DUTY_META,
  STAFF_DUTIES,
  type StaffDuty,
} from "~/features/admin/lib/duties";

export { STAFF_DUTIES, DUTY_META, type StaffDuty };

/**
 * duty 담당자 profile_id 목록.
 * 배정 있음 → 배정 명단. 배정 없음 → fallbackRoles 전체(기존 broadcast).
 * best-effort: 조회 실패 시 빈 배열(호출부가 0명이면 발송 skip — 기존 관례).
 */
export async function getDutyRecipientIds(duty: StaffDuty): Promise<string[]> {
  const { data: assigned, error } = await adminClient
    .from("staff_duty_assignments")
    .select("profile_id")
    .eq("duty", duty);
  if (error) {
    console.error("[duties] assignment lookup failed:", error.message);
    return [];
  }
  if (assigned && assigned.length > 0) {
    return assigned.map((a) => a.profile_id);
  }
  const { data: staff, error: fbErr } = await adminClient
    .from("profiles")
    .select("profile_id")
    .in("role", DUTY_META[duty].fallbackRoles);
  if (fbErr || !staff) return [];
  return staff.map((s) => s.profile_id);
}

export interface DutyAssignmentView {
  duty: StaffDuty;
  label: string;
  desc: string;
  assignedIds: string[];
}

/** 관리자 관리 화면용 — 전체 duty 의 배정 현황. */
export async function listDutyAssignments(): Promise<DutyAssignmentView[]> {
  const { data, error } = await adminClient
    .from("staff_duty_assignments")
    .select("duty, profile_id");
  if (error) throw error;
  const byDuty = new Map<string, string[]>();
  for (const row of data ?? []) {
    const arr = byDuty.get(row.duty) ?? [];
    arr.push(row.profile_id);
    byDuty.set(row.duty, arr);
  }
  return STAFF_DUTIES.map((duty) => ({
    duty,
    label: DUTY_META[duty].label,
    desc: DUTY_META[duty].desc,
    assignedIds: byDuty.get(duty) ?? [],
  }));
}

/** duty 하나의 담당자 명단 교체(전체 삭제 후 재삽입 — 화면 저장 단위). */
export async function setDutyAssignees(
  duty: StaffDuty,
  profileIds: string[],
  actorId: string,
): Promise<void> {
  const { error: delErr } = await adminClient
    .from("staff_duty_assignments")
    .delete()
    .eq("duty", duty);
  if (delErr) throw delErr;
  if (profileIds.length === 0) return;
  const { error: insErr } = await adminClient
    .from("staff_duty_assignments")
    .insert(
      profileIds.map((pid) => ({
        duty,
        profile_id: pid,
        created_by: actorId,
      })),
    );
  if (insErr) throw insErr;
}
