// 운영자(/admin) 접근 가드 SSOT — loader/action 에서 역할·권한을 일관되게 강제.
// 기존에 각 화면이 손수 (getUser → getStaffRole → 제각각 비교) 하던 것을 이 헬퍼로 통일한다.
// 실패 시 통일된 401/403 Response 를 throw — loader 에서 호출하면 그대로 에러 응답이 된다.
//
//   const { client, user, role } = await requireStaff(request, "manager");
//   const { client, user, role } = await requireDuty(request, "student_admin_access");

import { data } from "react-router";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { type UserRole, roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import type { StaffDuty } from "~/features/admin/lib/duties";
import { getStaffRole } from "~/features/laws/queries.server";

export interface StaffContext {
  client: SupabaseClient<Database>;
  user: { id: string; email: string | null };
  role: UserRole;
}

async function authStaff(request: Request): Promise<{
  client: SupabaseClient<Database>;
  userId: string;
  email: string | null;
  role: UserRole | null;
}> {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  return { client, userId: user.id, email: user.email ?? null, role };
}

/** 최소 역할(기본 instructor) 이상 스태프만. 미달·비로그인 시 403/401 throw. */
export async function requireStaff(
  request: Request,
  minRole: UserRole = "instructor",
): Promise<StaffContext> {
  const { client, userId, email, role } = await authStaff(request);
  if (!role || !roleAtLeast(role, minRole)) {
    throw data({ error: "Forbidden" }, { status: 403 });
  }
  return { client, user: { id: userId, email }, role };
}

/** manager 이상. */
export function requireManager(request: Request): Promise<StaffContext> {
  return requireStaff(request, "manager");
}

/** admin(원장) 전용. */
export function requireAdmin(request: Request): Promise<StaffContext> {
  return requireStaff(request, "admin");
}

/** 접근형 duty 보유(또는 admin). 미보유 시 403 throw. */
export async function requireDuty(
  request: Request,
  duty: StaffDuty,
): Promise<StaffContext> {
  const { client, userId, email, role } = await authStaff(request);
  const ok = await hasDutyAccess(duty, userId, role);
  if (!ok) throw data({ error: "Forbidden" }, { status: 403 });
  // role 은 스태프가 아닐 수도 있으나(비스태프가 duty 배정 불가) 방어적으로 확정.
  if (!role) throw data({ error: "Forbidden" }, { status: 403 });
  return { client, user: { id: userId, email }, role };
}
