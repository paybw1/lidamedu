// /lecture/orders — 내 주문·배송 조회 (feat-11-004 4c, 구 /me/orders). RLS self-read.

import { PackageIcon } from "lucide-react";
import { redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";

import type { Route } from "./+types/my-orders";

export const meta: Route.MetaFunction = () => [
  { title: "내 주문·배송 | 리담변리사학원" },
];

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "결제 대기",
  pending_deposit: "입금 대기",
  paid: "결제 완료",
  partially_refunded: "부분 환불",
  refunded: "환불 완료",
  cancelled: "취소",
  failed: "실패",
  draft: "임시",
};
const SHIP_STATUS_LABEL: Record<string, string> = {
  preparing: "배송 준비중",
  shipped: "발송됨",
  delivered: "배송 완료",
  returned: "반품",
};

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  const { data: orders } = await client
    .from("orders")
    .select("order_id, status, total_krw, payment_method, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const orderIds = (orders ?? []).map((o) => o.order_id);

  const itemsByOrder = new Map<string, Array<{
    orderItemId: string;
    label: string;
    itemType: string;
    quantity: number;
    unitPriceKrw: number;
    refundedAt: string | null;
    shipment: { status: string; courier: string | null; trackingNo: string | null } | null;
  }>>();
  if (orderIds.length > 0) {
    const { data: items } = await client
      .from("order_items")
      .select(
        "order_item_id, order_id, item_type, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title), shipment:shipments!shipments_order_item_id_fkey(status, courier, tracking_no)",
      )
      .in("order_id", orderIds);
    for (const it of items ?? []) {
      const plan = it.plan as { name: string } | null;
      const book = it.book as { title: string } | null;
      const shipmentRaw = it.shipment as
        | { status: string; courier: string | null; tracking_no: string | null }
        | Array<{ status: string; courier: string | null; tracking_no: string | null }>
        | null;
      const shipment = Array.isArray(shipmentRaw) ? (shipmentRaw[0] ?? null) : shipmentRaw;
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push({
        orderItemId: it.order_item_id,
        label: plan?.name ?? book?.title ?? "(항목)",
        itemType: it.item_type,
        quantity: it.quantity,
        unitPriceKrw: it.unit_price_krw,
        refundedAt: it.refunded_at,
        shipment: shipment
          ? { status: shipment.status, courier: shipment.courier, trackingNo: shipment.tracking_no }
          : null,
      });
      itemsByOrder.set(it.order_id, arr);
    }
  }

  // 4d — 내 쿠폰 (발급/사용 내역)
  const { data: coupons } = await client
    .from("user_coupons")
    .select(
      "user_coupon_id, issued_reason, issued_at, expires_at, used_at, discount:discounts!user_coupons_discount_id_fkey(name, code, kind, value)",
    )
    .eq("user_id", user.id)
    .order("issued_at", { ascending: false });

  return {
    coupons: (coupons ?? []).map((c) => {
      const d = c.discount as { name: string; code: string | null; kind: string; value: number } | null;
      return {
        userCouponId: c.user_coupon_id,
        name: d?.name ?? "쿠폰",
        code: d?.code ?? null,
        valueLabel: d ? (d.kind === "percent" ? `${d.value}%` : `₩${d.value.toLocaleString("ko-KR")}`) : "",
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        usedAt: c.used_at,
      };
    }),
    orders: (orders ?? []).map((o) => ({
      orderId: o.order_id,
      orderNo: o.order_id.slice(0, 8).toUpperCase(),
      status: o.status,
      totalKrw: o.total_krw,
      paymentMethod: o.payment_method,
      createdAt: o.created_at,
      items: itemsByOrder.get(o.order_id) ?? [],
    })),
  };
}

export default function MyOrders({ loaderData }: Route.ComponentProps) {
  const { orders, coupons } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <PackageIcon className="size-5" /> 내 주문·배송
      </h1>

      {coupons.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-[15px] font-bold">내 쿠폰</h2>
            <p className="text-muted-foreground text-[12px]">
              결제 화면에서 쿠폰 코드를 입력하면 적용됩니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {coupons.map((c) => (
              <div
                key={c.userCouponId}
                className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]"
              >
                <span className={c.usedAt ? "text-muted-foreground line-through" : "font-medium"}>
                  {c.name} ({c.valueLabel})
                </span>
                {c.code && !c.usedAt ? (
                  <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">{c.code}</span>
                ) : null}
                {c.usedAt ? <Badge variant="outline">사용됨</Badge> : null}
                <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
                  {c.expiresAt ? `~${c.expiresAt.slice(0, 10)}` : "기한 없음"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {orders.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            주문 내역이 없습니다.
          </CardContent>
        </Card>
      ) : (
        orders.map((o) => (
          <Card key={o.orderId}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground font-mono text-[12px]">{o.orderNo}</span>
                <Badge variant={o.status === "paid" ? "default" : "secondary"}>
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </Badge>
                <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
                  {new Date(o.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {o.items.map((it) => (
                <div
                  key={it.orderItemId}
                  className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]"
                >
                  <span className={it.refundedAt ? "text-muted-foreground line-through" : "font-medium"}>
                    {it.label}
                    {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                  </span>
                  {it.refundedAt ? <Badge variant="outline">환불됨</Badge> : null}
                  {it.shipment ? (
                    <span className="text-muted-foreground ml-auto text-[12px]">
                      {SHIP_STATUS_LABEL[it.shipment.status] ?? it.shipment.status}
                      {it.shipment.courier && it.shipment.trackingNo ? (
                        <span className="ml-1 font-mono">
                          {it.shipment.courier} {it.shipment.trackingNo}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
                      ₩{(it.unitPriceKrw * it.quantity).toLocaleString("ko-KR")}
                    </span>
                  )}
                </div>
              ))}
              <p className="text-right text-[13px] font-semibold tabular-nums">
                합계 ₩{o.totalKrw.toLocaleString("ko-KR")}
              </p>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
