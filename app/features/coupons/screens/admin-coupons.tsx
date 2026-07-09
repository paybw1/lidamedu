// feat-13 쿠폰 관리 목록 — /admin/coupons (매출·정산). 컬럼: No·쿠폰ID·범위·쿠폰명·
// 할인혜택(최대금액)·유효기간·사용일수·발행수·공용여부·상태.
import { PlusIcon } from "lucide-react";
import { Link, redirect, useFetcher } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { getStaffRole } from "~/features/laws/queries.server";

import {
  DISCOUNT_LABEL,
  SCOPE_LABEL,
  STATUS_LABEL,
  formatDiscount,
  formatValidPeriod,
  type CouponScope,
  type CouponStatus,
  type DiscountType,
} from "../labels";
import { listCoupons } from "../queries.server";

import type { Route } from "./+types/admin-coupons";

export function meta() {
  return [{ title: "쿠폰 관리 | 운영관리" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");
  const role = await getStaffRole(client, user.id);
  if (!role) throw redirect("/dashboard");
  const coupons = await listCoupons(client);
  return { role, coupons };
}

const TH = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap";
const TD = "px-3 py-2.5 text-sm whitespace-nowrap";

function DeleteButton({ id }: { id: string }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form
      method="post"
      action="/api/admin/coupon"
      onSubmit={(e) => {
        if (!confirm("이 쿠폰을 삭제하시겠습니까?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-muted-foreground hover:text-rose-600 text-xs font-medium"
        disabled={fetcher.state !== "idle"}
      >
        삭제
      </button>
    </fetcher.Form>
  );
}

export default function AdminCoupons({ loaderData }: Route.ComponentProps) {
  const { role, coupons } = loaderData;
  return (
    <AdminShell
      cluster="sales"
      role={role}
      title="쿠폰 관리"
      desc="할인 쿠폰을 등록·관리합니다. 유효기간이 사용일수보다 우선 적용됩니다."
      headerRight={
        <Button asChild size="sm">
          <Link to="/admin/coupons/new">
            <PlusIcon className="size-4" /> 쿠폰 등록
          </Link>
        </Button>
      }
    >
      <div className="p-5 md:p-8">
        {coupons.length === 0 ? (
          <div className="text-muted-foreground rounded-xl border border-dashed py-16 text-center text-sm">
            등록된 쿠폰이 없습니다.
          </div>
        ) : (
          <div className="border-border bg-card overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse">
              <thead className="bg-muted/50 border-border border-b">
                <tr>
                  <th className={TH}>No</th>
                  <th className={TH}>쿠폰ID</th>
                  <th className={TH}>쿠폰범위</th>
                  <th className={TH}>쿠폰명</th>
                  <th className={TH}>할인혜택 (최대금액)</th>
                  <th className={TH}>유효기간</th>
                  <th className={TH}>사용일수</th>
                  <th className={TH}>발행수</th>
                  <th className={TH}>공용여부</th>
                  <th className={TH}>상태</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {coupons.map((c, i) => (
                  <tr key={c.coupon_id} className="hover:bg-muted/30">
                    <td className={`${TD} text-muted-foreground tabular-nums`}>
                      {coupons.length - i}
                    </td>
                    <td className={`${TD} font-mono text-xs`}>
                      <Link
                        to={`/admin/coupons/${c.coupon_id}/edit`}
                        className="text-primary hover:underline"
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td className={TD}>{SCOPE_LABEL[c.scope as CouponScope]}</td>
                    <td className={`${TD} font-semibold`}>{c.name}</td>
                    <td className={TD}>
                      <span className="text-muted-foreground text-xs">
                        {DISCOUNT_LABEL[c.discount_type as DiscountType]}
                      </span>{" "}
                      {formatDiscount(c)}
                    </td>
                    <td className={`${TD} tabular-nums text-xs`}>
                      {formatValidPeriod(c)}
                    </td>
                    <td className={`${TD} tabular-nums`}>
                      {c.usable_days ? `${c.usable_days}일` : "—"}
                    </td>
                    <td className={`${TD} tabular-nums`}>{c.issue_count}장</td>
                    <td className={TD}>
                      <Badge variant="outline" className="text-[11px]">
                        {c.is_shared ? "공용" : "개별"}
                      </Badge>
                    </td>
                    <td className={TD}>
                      {c.status === "active" ? (
                        <Badge className="text-[11px]">정상</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px]">
                          중지
                        </Badge>
                      )}
                    </td>
                    <td className={TD}>
                      <DeleteButton id={c.coupon_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
