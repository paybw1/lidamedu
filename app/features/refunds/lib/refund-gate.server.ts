// feat-11-013 P6-c — 환불관리 접근 게이트.
//
// ★두 단계로 나눈다.
//     읽기·접수     = manager 이상 + `lms_orders_admin` 직무 (주문관리와 같은 문)
//     확정·되돌리기 = **admin 전용** (요청서 §10 「환불완료 후 수정은 원장 권한과 수정사유 필수」)
//
// ★이 게이트가 마지막 방어선이다. `commit_refund`·`set_refund_status` 를 service_role
//   전용으로 둔 이유가 `private.is_staff` 에 강사가 포함되기 때문인데, 그 RPC 를 부르는
//   경로가 여기뿐이다.

import { data } from "react-router";

import { roleAtLeast } from "~/core/lib/roles";
import makeServerClient from "~/core/lib/supa-client.server";
import { hasDutyAccess } from "~/features/admin/lib/duties.server";
import { getStaffRole } from "~/features/laws/queries.server";

export async function requireRefundStaff(request: Request) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!roleAtLeast(role, "manager")) throw data("Forbidden", { status: 403 });
  if (!(await hasDutyAccess("lms_orders_admin", user.id, role))) {
    throw data("Forbidden — 관리자 관리에서 접근 권한을 배정받아야 합니다.", { status: 403 });
  }
  return { user, role };
}

export async function requireRefundAdmin(request: Request) {
  const ctx = await requireRefundStaff(request);
  if (!roleAtLeast(ctx.role, "admin")) {
    throw data("Forbidden — 환불 확정은 원장만 할 수 있습니다.", { status: 403 });
  }
  return ctx;
}
