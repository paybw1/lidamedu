// feat-11-013 P6-c — 환불신청 등록 (요청서 PART B §2).
//
// ★「환불신청 등록」은 **실제 환불 실행이 아니다.** 환불관리에 건을 만드는 일이고,
//   여기서는 돈이 한 푼도 움직이지 않는다. 토스 취소는 §5 대로 관리자가 직접 한다.

import { Form, data, redirect } from "react-router";

import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Field } from "~/features/admin/components/admin-ui";
import { requireRefundStaff } from "~/features/refunds/lib/refund-gate.server";
import {
  REFUND_INTAKE_CHANNELS,
  REFUND_INTAKE_CHANNEL_LABELS,
} from "~/features/refunds/lib/refund-status";
import { createRefundIntake, getOrderForRefund } from "~/features/refunds/queries.server";

import type { Route } from "./+types/admin-refund-new";

export const meta: Route.MetaFunction = () => [
  { title: "환불신청 등록 | 리담변리사학원" },
];

const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;

export async function loader({ request }: Route.LoaderArgs) {
  const { role } = await requireRefundStaff(request);
  const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
  const order = orderId ? await getOrderForRefund(orderId) : null;
  if (!order) throw data("주문을 찾을 수 없습니다.", { status: 404 });
  return { order, role };
}

export async function action({ request }: Route.ActionArgs) {
  const { user } = await requireRefundStaff(request);
  const form = await request.formData();
  const res = await createRefundIntake({
    orderId: String(form.get("orderId") ?? ""),
    orderItemIds: form.getAll("orderItemIds").map(String),
    intakeChannel: String(form.get("intakeChannel") ?? "phone"),
    requestReason: String(form.get("requestReason") ?? "").trim(),
    consultNote: String(form.get("consultNote") ?? "").trim() || null,
    adminMemo: String(form.get("adminMemo") ?? "").trim() || null,
    intakeBy: user.id,
  });
  if (!res.ok) return data({ error: res.error }, { status: 400 });
  return redirect(`/admin/refunds/${res.refundId}`);
}

export default function AdminRefundNew({ loaderData, actionData }: Route.ComponentProps) {
  const { order, role } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  // 이미 환불됐거나 다른 건이 열려 있는 항목은 고를 수 없다(요청서 §10 중복 차단).
  const selectable = order.items.filter((i) => !i.refundedAt && !i.lockedByOpenRefund);

  return (
    <AdminShell
      cluster="sales"
      role={role}
      title="환불신청 등록"
      desc="고객센터 상담 내용을 확인한 관리자가 환불건을 생성합니다. 이 단계에서는 결제가 취소되지 않습니다."
      width={980}
    >
      <div className="border-border bg-card mb-4 rounded-xl border p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold">주문 정보</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
          <Row label="회원" value={order.userName || "—"} />
          <Row label="주문번호" value={order.orderId.slice(0, 8)} mono />
          <Row label="결제일시" value={order.paidAt?.slice(0, 16).replace("T", " ") ?? "—"} />
          <Row label="결제금액" value={won(order.totalKrw)} mono />
          <Row label="배송비" value={won(order.shippingFeeKrw)} mono />
          <Row label="쿠폰 할인" value={won(order.couponDiscountKrw)} mono />
          <Row label="사용 포인트" value={won(order.pointAmountKrw)} mono />
          <Row label="결제수단" value={order.paymentMethod === "toss" ? "토스" : "무통장"} />
          <Row label="누적 환불액" value={won(order.priorRefundedKrw)} mono />
        </dl>
      </div>

      <Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="orderId" value={order.orderId} />

        <div className="border-border bg-card rounded-xl border p-4 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold">환불 대상 상품</h2>
          <p className="text-muted-foreground mb-3 text-[11px]">
            패키지는 주문항목 한 줄이라 구성강좌만 따로 환불할 수 없습니다. 교재 수량 일부
            환불은 아직 지원하지 않습니다.
          </p>
          <ul className="flex flex-col gap-2">
            {order.items.map((i) => {
              const blocked = !!i.refundedAt || i.lockedByOpenRefund;
              return (
                <li
                  key={i.orderItemId}
                  className="border-border/60 flex items-center gap-3 rounded-lg border p-3"
                >
                  <input
                    type="checkbox"
                    id={`it-${i.orderItemId}`}
                    name="orderItemIds"
                    value={i.orderItemId}
                    disabled={blocked}
                    className="size-4"
                  />
                  <label
                    htmlFor={`it-${i.orderItemId}`}
                    className="flex min-w-0 flex-1 flex-col gap-0.5"
                  >
                    <span className="truncate text-[13px] font-medium">{i.label}</span>
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      {i.itemType === "book" ? "교재" : "강의"} · 수량 {i.quantity} · 정가{" "}
                      {won(i.unitPriceKrw * i.quantity)}
                      {i.paidAmountKrw != null ? ` · 실결제 ${won(i.paidAmountKrw)}` : ""}
                    </span>
                  </label>
                  {blocked ? (
                    <span className="text-muted-foreground shrink-0 text-[11px]">
                      {i.refundedAt ? "이미 환불됨" : "다른 환불건 진행 중"}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {selectable.length === 0 ? (
            <p className="mt-3 text-[12px] text-rose-600">
              환불할 수 있는 상품이 없습니다.
            </p>
          ) : null}
        </div>

        <div className="border-border bg-card grid gap-4 rounded-xl border p-4 shadow-sm sm:grid-cols-2">
          <Field label="접수경로" required htmlFor="intakeChannel">
            <select
              id="intakeChannel"
              name="intakeChannel"
              defaultValue="phone"
              className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
            >
              {REFUND_INTAKE_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {REFUND_INTAKE_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="환불 요청사유" required htmlFor="requestReason">
            <input
              id="requestReason"
              name="requestReason"
              required
              maxLength={200}
              placeholder="고객이 말한 사유를 그대로"
              className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
            />
          </Field>
          <Field
            label="상담내용"
            className="sm:col-span-2"
            htmlFor="consultNote"
            hint="상담 과정과 학생에게 안내한 내용. 분쟁 때 근거가 됩니다."
          >
            <textarea
              id="consultNote"
              name="consultNote"
              rows={3}
              maxLength={2000}
              className="border-input bg-background focus:border-primary rounded-md border px-3 py-2 text-[13px] outline-none"
            />
          </Field>
          <Field label="관리자 메모" className="sm:col-span-2" htmlFor="adminMemo">
            <input
              id="adminMemo"
              name="adminMemo"
              maxLength={500}
              placeholder="내부 참고사항"
              className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
            />
          </Field>
        </div>

        {error ? <p className="text-[12px] text-rose-600">{error}</p> : null}

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={selectable.length === 0}>
            환불신청 등록
          </Button>
          <span className="text-muted-foreground text-[11px]">
            등록해도 결제는 취소되지 않습니다.
          </span>
        </div>
      </Form>
    </AdminShell>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-muted-foreground text-[11px] font-semibold">{label}</dt>
      <dd className={mono ? "tabular-nums" : undefined}>{value}</dd>
    </div>
  );
}
