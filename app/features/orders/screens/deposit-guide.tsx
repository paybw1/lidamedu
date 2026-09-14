// 입금 안내 — 무통장으로 신청한 주문의 계좌·입금자명·금액·기한 (feat-11-012 P5-e).
//
// ★이 화면이 없으면 무통장은 **작동하지 않는다.** 신청은 서버에 이미 있었지만
//   학생이 「어디로 얼마를 언제까지」를 볼 데가 없었다 — 그래서 D2 가 열리기 전까지
//   무통장은 서버만 완성된 반쪽이었다(감사 V4).
// ★계좌는 app_settings 에서 읽는다. 코드에 박으면 계좌가 바뀔 때 학생이 틀린 곳으로 넣는다.
// ★남은 시간은 **서버가 준 만료 시각**으로만 말한다. 화면이 자기 시계로 세면
//   기기 시계가 틀어진 사람에게 「기한 지남」이 잘못 뜬다.

import { BanknoteIcon, ClockIcon } from "lucide-react";
import { Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/components/ui/card";
import { getBankAccount } from "~/core/lib/app-settings.server";
import { dateTime, won } from "~/core/lib/format";
import makeServerClient from "~/core/lib/supa-client.server";
import { orderItemLabelWithQuantity } from "~/features/orders/lib/order-item-label";

import type { Route } from "./+types/deposit-guide";

export function meta() {
  return [{ title: "입금 안내 | 리담변리사학원" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw data("Unauthorized", { status: 401 });

  const orderId = params.orderId ?? "";
  if (!orderId) throw data("Not Found", { status: 404 });

  // ★RLS(본인 주문만)를 그대로 탄다 — 남의 주문번호를 넣어도 not found 가 된다.
  const { data: order } = await client
    .from("orders")
    .select(
      "order_id, status, total_krw, created_at, items:order_items!order_items_order_id_fkey(item_type, quantity, title_snapshot)",
    )
    .eq("order_id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) throw data("Not Found", { status: 404 });

  const { data: transfer } = await client
    .from("bank_transfers")
    .select("depositor_name, expected_amount_krw, expires_at, deposited_at")
    .eq("order_id", order.order_id)
    .maybeSingle();

  return {
    orderNo: order.order_id.slice(0, 8),
    status: order.status,
    totalKrw: order.total_krw,
    itemLabels: (order.items ?? []).map((it) =>
      orderItemLabelWithQuantity({
        itemType: it.item_type,
        titleSnapshot: it.title_snapshot,
        quantity: it.quantity,
      }),
    ),
    bank: await getBankAccount(client),
    transfer: transfer
      ? {
          depositorName: transfer.depositor_name,
          expectedKrw: transfer.expected_amount_krw,
          expiresAt: transfer.expires_at,
          depositedAt: transfer.deposited_at,
        }
      : null,
  };
}

export default function DepositGuide({ loaderData }: Route.ComponentProps) {
  const { orderNo, status, totalKrw, itemLabels, bank, transfer } = loaderData;
  const confirmed = Boolean(transfer?.depositedAt) || status === "paid";
  const cancelled = status === "cancelled" || status === "expired";

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10 md:px-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
        <BanknoteIcon className="size-6" /> 입금 안내
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">주문번호 {orderNo}</p>

      {confirmed ? (
        <Card className="mt-6 border-emerald-300 dark:border-emerald-900/60">
          <CardContent className="py-5">
            <p className="text-sm font-semibold">입금이 확인되었습니다.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              수강권과 배송이 시작되었습니다. 내 강의실에서 확인해 주세요.
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/lecture">내 강의실로</Link>
            </Button>
          </CardContent>
        </Card>
      ) : cancelled ? (
        <Card className="mt-6 border-amber-300 dark:border-amber-900/60">
          <CardContent className="py-5">
            <p className="text-sm font-semibold">
              입금 기한이 지나 주문이 취소되었습니다.
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              다시 담아 주문해 주세요. 금액이 이미 입금되었다면 고객센터로 알려
              주세요.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/lecture/cart">장바구니</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/lecture/support">고객센터</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">아래 계좌로 입금해 주세요</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bank ? (
                <div className="bg-muted/50 rounded-lg border px-4 py-3">
                  <p className="text-lg font-bold">
                    {bank.bank} {bank.number}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    예금주 {bank.holder}
                  </p>
                </div>
              ) : (
                // ★계좌가 설정되지 않았을 때 빈칸을 보이지 않는다. 무엇을 해야 하는지 말한다.
                <p className="text-sm text-red-600 dark:text-red-400">
                  입금 계좌가 아직 등록되지 않았습니다. 고객센터로 문의해 주세요.
                </p>
              )}
              <dl className="grid gap-2 text-sm">
                <Line label="입금 금액" value={won(transfer?.expectedKrw ?? totalKrw)} />
                <Line label="입금자명" value={transfer?.depositorName ?? "-"} />
                {transfer?.expiresAt ? (
                  <Line
                    label="입금 기한"
                    value={dateTime(transfer.expiresAt)}
                    icon={<ClockIcon className="size-3.5" />}
                  />
                ) : null}
              </dl>
              <p className="text-muted-foreground text-xs">
                ★입금자명이 신청한 이름과 다르면 확인이 늦어집니다. 기한이 지나면 주문이
                자동 취소됩니다.
              </p>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">주문 내용</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {itemLabels.map((label, i) => (
                  <li key={i} className="truncate">
                    {label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="mt-6 flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/lecture/orders">주문 내역</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/lecture/support">고객센터</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
