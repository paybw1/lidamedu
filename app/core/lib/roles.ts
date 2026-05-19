// 회원 역할 SSOT — 4단계 권한 (feat-7-031). 등급: 원장 > 관리자 > 강사 > 수험생.
// 모든 권한 판정·표시는 이 파일을 단일 출처로 한다.

import type { Database } from "database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

/** 등급 — 클수록 상위 권한. 권한 비교의 기준. */
export const ROLE_RANK: Record<UserRole, number> = {
  student: 0,
  instructor: 1,
  manager: 2,
  admin: 3,
};

/** 화면 표시용 한글 라벨. */
export const ROLE_LABEL: Record<UserRole, string> = {
  student: "수험생",
  instructor: "강사",
  manager: "관리자",
  admin: "원장",
};

/** 역할 선택 UI 옵션 — 등급 오름차순. */
export const ROLE_OPTIONS: ReadonlyArray<{ value: UserRole; label: string }> = (
  ["student", "instructor", "manager", "admin"] as const
).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** role 이 min 등급 이상인지. role 이 없으면(비로그인) false. */
export function roleAtLeast(
  role: UserRole | null | undefined,
  min: UserRole,
): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** 스태프(강사 이상 — 강사·관리자·원장) 여부. */
export function isStaffRole(role: UserRole | null | undefined): boolean {
  return roleAtLeast(role, "instructor");
}
