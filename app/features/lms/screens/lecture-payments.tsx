// 결제내역 조회 — /lecture/payments. 내 주문의 결제·환불 이력(RLS self-read).
import { ReceiptTextIcon } from "lucide-react";
import { redirect } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { date as fmtDate, won } from "~/core/lib/format";
import makeServerClient from "~/core/lib/supa-client.server";
import { orderItemLabelWithQuantity } from "~/features/orders/lib/order-item-label";
import {
  HIDDEN_FROM_STUDENT_FILTER,
  orderStatusLabel,
  orderStatusTone,
  paymentMethodLabel,
} from "~/features/orders/lib/order-status";

import { EmptyState } from "../components/empty-state";

import type { Route } from "./+types/lecture-payments";

export function meta() {
  return [{ title: "결제내역 조회 | 리담변리사학원" }];
}

// ★표기는 전부 SSOT 를 쓴다(feat-11-012 P6-c). 종전에는 이 화면이 세 벌의 지역 표를
//   들고 있었고 셋 다 서버가 쓰는 값을 다 담지 못해 **원시 영문이 학생에게 노출**됐다:
//   상태 attempted·expired 누락 / 결제수단 manual 누락(그리고 도메인에 없는 card 가 잔존) /
//   상품유형 course_extension 누락(course·bundle·membership 은 쓰이지 않는 죽은 키).
//   상품명은 feat-11-011 D4 가 지정한 SSOT(order-item-label)를 쓴다 — 이 화면만 안 쓰고 있었다.

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw redirect("/login");

  // ★feat-11-011 D3 — 결제창까지만 갔다가 끝난 건(attempted·expired·pending_payment)은
  //   학생에게 「주문」이 아니다. 종전에는 draft 만 걸러 내 결제하지 않은 건이 내역에 쌓여 보였다.
  const { data: orders } = await client
    .from("orders")
    .select("order_id, status, total_krw, payment_method, created_at")
    .eq("user_id", user.id)
    .not("status", "in", HIDDEN_FROM_STUDENT_FILTER)
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (orders ?? []).map((o) => o.order_id);

  const itemsByOrder = new Map<string, string[]>();
  if (ids.length) {
    const { data: items } = await client
      .from("order_items")
      .select("order_id, item_type, quantity, title_snapshot")
      .in("order_id", ids);
    for (const it of items ?? []) {
      const arr = itemsByOrder.get(it.order_id) ?? [];
      arr.push(
        orderItemLabelWithQuantity({
          itemType: it.item_type,
          titleSnapshot: it.title_snapshot,
          quantity: it.quantity,
        }),
      );
      itemsByOrder.set(it.order_id, arr);
    }
  }
  // 승인번호(PG paymentKey) — 주문에 연결된 결제건. RLS self-read.
  const payKeyByOrder = new Map<string, string>();
  if (ids.length) {
    const { data: pays } = await client
      .from("payments")
      .select("order_id, toss_payment_key")
      .in("order_id", ids)
      .not("toss_payment_key", "is", null);
    for (const p of pays ?? []) {
      if (p.order_id && p.toss_payment_key) payKeyByOrder.set(p.order_id, p.toss_payment_key);
    }
  }
  return {
    orders: (orders ?? []).map((o) => ({
      ...o,
      items: itemsByOrder.get(o.order_id) ?? [],
      paymentKey: payKeyByOrder.get(o.order_id) ?? null,
    })),
  };
}

export default function LecturePayments({ loaderData }: Route.ComponentProps) {
  const { orders } = loaderData;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
          <ReceiptTextIcon className="size-3.5" /> 마이페이지
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">결제내역 조회</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          강의·도서 결제와 환불 이력입니다. 최근 순으로 표시됩니다.
        </p>
      </header>

      {orders.length === 0 ? (
        <EmptyState
          icon={<ReceiptTextIcon className="size-6" />}
          title="아직 결제내역이 없습니다"
          description="수강신청·도서 구매를 하시면 이곳에서 결제와 환불 이력을 확인할 수 있습니다."
          actions={[
            { label: "강의 둘러보기", to: "/lecture/catalog" },
            { label: "주문·배송 내역", to: "/lecture/orders" },
          ]}
        />
      ) : (
      <ul className="flex flex-col gap-3">
        {orders.map((o) => {
          return (
            <li
              key={o.order_id}
              className="border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-4 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {fmtDate(o.created_at)}
                  </span>
                  <Badge
                    variant={
                      orderStatusTone(o.status) === "ok" ? "default" : "secondary"
                    }
                    className="text-[11px]"
                  >
                    {orderStatusLabel(o.status)}
                  </Badge>
                </div>
                <p className="mt-1 text-sm font-semibold">
                  {o.items.length ? o.items.join(", ") : "주문"}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {paymentMethodLabel(o.payment_method)} · 주문번호{" "}
                  <span className="font-mono">{o.order_id.slice(0, 8)}</span>
                  {o.paymentKey ? (
                    <>
                      {" · 승인번호 "}
                      <span className="font-mono">{o.paymentKey}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-bold tabular-nums">
                  {won(o.total_krw)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}
