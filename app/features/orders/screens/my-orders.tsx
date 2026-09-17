// /lecture/orders — 내 주문·배송 조회 (feat-11-004 4c, 구 /me/orders). RLS self-read.

import { PackageIcon } from "lucide-react";
import { Link, redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Card, CardContent, CardHeader } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { EmptyState } from "~/features/lms/components/empty-state";
import {
  HIDDEN_FROM_STUDENT_FILTER,
  orderStatusLabel,
} from "~/features/orders/lib/order-status";

import type { Route } from "./+types/my-orders";
import { orderItemLabel } from "~/features/orders/lib/order-item-label";

export const meta: Route.MetaFunction = () => [
  { title: "내 주문·배송 | 리담변리사학원" },
];

// ★표기는 SSOT 를 쓴다(feat-11-012 P6-c) — 지역 표는 서버가 쓰는 attempted·expired 를
//   담지 못해 원시 영문이 학생에게 나갔다.
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
    // ★feat-11-011 D3 — 결제창까지만 갔다 끝난 건은 학생에게 「주문」이 아니다.
    //   종전에는 **거르지 않아** 장바구니(draft)·결제시도(attempted)까지 내역에 보였다.
    .not("status", "in", HIDDEN_FROM_STUDENT_FILTER)
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
        "order_item_id, order_id, item_type, title_snapshot, quantity, unit_price_krw, refunded_at, plan:subscription_plans!order_items_plan_id_fkey(name), book:books!order_items_book_fk(title), shipment:shipments!shipments_order_item_id_fkey(status, courier, tracking_no)",
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
        label: orderItemLabel({
          itemType: it.item_type,
          titleSnapshot: it.title_snapshot,
          planName: plan?.name,
          bookTitle: book?.title,
        }),
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

  // ★feat-11-014 Q3 — 레거시 학생 환불요청(refund_requests) 조회는 제거했다. 환불은 관리자가
  //   환불관리(refunds)에 접수·처리하고, 그 표는 RLS 가 staff 전용 select 라 학생 화면에서
  //   읽을 수 없다. 학생에게는 항목의 `refunded_at`(환불됨)과 아래 고객센터 안내만 보인다.

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
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-8 md:px-6 md:py-10">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <PackageIcon className="size-5" /> 내 주문·배송
      </h1>

      {coupons.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <h2 className="text-base font-bold">내 쿠폰</h2>
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
        <EmptyState
          icon={<PackageIcon className="size-6" />}
          title="아직 주문 내역이 없습니다"
          description="강의를 수강신청하거나 도서를 구매하면 이곳에서 주문과 배송 상태를 확인할 수 있습니다."
          actions={[
            { label: "강의 둘러보기", to: "/lecture/catalog" },
            { label: "도서 둘러보기", to: "/lecture/books" },
          ]}
        />
      ) : (
        orders.map((o) => (
          <Card key={o.orderId}>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground font-mono text-[12px]">{o.orderNo}</span>
                <Badge variant={o.status === "paid" ? "default" : "secondary"}>
                  {orderStatusLabel(o.status)}
                </Badge>
                {o.status === "pending_deposit" ? (
                  // ★입금 대기 주문에는 **들어갈 문**이 있어야 한다. 계좌를 다시 볼 데가
                  //   없으면 학생은 신청해 놓고 입금을 못 한다.
                  <Link
                    to={`/lecture/orders/${o.orderId}/deposit`}
                    className="text-primary text-[12px] font-medium hover:underline"
                  >
                    입금 안내 보기
                  </Link>
                ) : null}
                <span className="text-muted-foreground ml-auto text-[12px] tabular-nums">
                  {new Date(o.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {o.items.map((it) => (
                <OrderItemRow key={it.orderItemId} item={it} orderStatus={o.status} />
              ))}
              <p className="text-right text-[13px] font-semibold tabular-nums">
                합계 ₩{o.totalKrw.toLocaleString("ko-KR")}
              </p>
              {/* feat-11-013 D10 — 신청 버튼을 없앤 자리에 **어디로 가야 하는지**를 남긴다.
                  버튼만 지우면 학생은 환불을 어떻게 요청하는지 알 길이 없다. */}
              {["paid", "partially_refunded"].includes(o.status) ? (
                <p className="text-muted-foreground text-[12px]">
                  환불 문의는{" "}
                  <Link to="/lecture/support/new" className="text-link hover:underline">
                    고객센터
                  </Link>
                  로 접수해 주세요. 상담 후 담당자가 처리해 드립니다.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

type OrderItem = {
  orderItemId: string;
  label: string;
  itemType: string;
  quantity: number;
  unitPriceKrw: number;
  refundedAt: string | null;
  shipment: { status: string; courier: string | null; trackingNo: string | null } | null;
};

function OrderItemRow({ item: it, orderStatus }: { item: OrderItem; orderStatus: string }) {
  // ★feat-11-013 D10 — **학생이 직접 환불을 신청하는 버튼은 제공하지 않는다**(요청서 PART B §1).
  //   환불 문의는 전화·카카오톡·게시판·방문 등 고객센터로 접수하고, 상담 내용을 확인한
  //   관리자가 관리자페이지에서 환불신청을 등록한다. 여기에는 **결과만** 보인다 —
  //   환불된 상품(`refundedAt`). 레거시 환불요청 배지는 feat-11-014 Q3 에서 경로째 제거했다
  //   (운영 0건이라 사라진 건이 없다).
  return (
    <div className="border-border/60 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
      <span className={it.refundedAt ? "text-muted-foreground line-through" : "font-medium"}>
        {it.label}
        {it.quantity > 1 ? ` ×${it.quantity}` : ""}
      </span>
      {it.refundedAt ? <Badge variant="outline">환불됨</Badge> : null}
      {it.shipment ? (
        <span className="text-muted-foreground ml-auto text-[12px]">
          {SHIP_STATUS_LABEL[it.shipment.status] ?? it.shipment.status}
          {it.shipment.courier && it.shipment.trackingNo ? (
            <span className="ml-1">
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
  );
}
