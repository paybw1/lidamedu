// feat-11-013 P6-c — 환불 상세·처리 (요청서 PART B §6·§7·§8·§10).
//
// ★블록 4「환불금액 계산」은 P6 에서는 **상품별 금액 한 칸 + 공제사유**다.
//   수강분 공제·반품비·산출근거를 자동으로 채우는 것은 P7(환불규정 자동계산)의 일이고,
//   여기서 계산기를 흉내 내기 시작하면 두 곳에 계산이 생긴다.
// ★헤더의 「이번 환불금액」은 **입력칸이 아니라 상품별 합계**다. 두 칸을 따로 두면
//   관리자가 둘을 맞춰 두어야 하고, 확정 RPC 는 어차피 둘이 같은지 검사한다.

import { Form, Link, data } from "react-router";

import { Button } from "~/core/components/ui/button";
import { AdminShell } from "~/features/admin/components/admin-shell";
import { Chip, Field } from "~/features/admin/components/admin-ui";
import { requireRefundAdmin, requireRefundStaff } from "~/features/refunds/lib/refund-gate.server";
import {
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  REFUND_STATUS_LABELS,
  REFUND_TRANSITIONS,
  type RefundStatus,
  checkRefundTransition,
  isMoneyMovedStatus,
  remainingRefundableKrw,
  resolveDoneStatus,
} from "~/features/refunds/lib/refund-status";
import { getRefundDetail, saveRefundAmounts, savePgCancel } from "~/features/refunds/queries.server";
import { commitRefund, setRefundStatus } from "~/features/refunds/refunds.server";

import type { Route } from "./+types/admin-refund-detail";

export const meta: Route.MetaFunction = () => [
  { title: "환불 상세 | 리담변리사학원" },
];

const won = (n: number | null | undefined) =>
  n == null ? "—" : `₩${n.toLocaleString("ko-KR")}`;
const dt = (s: string | null) => (s ? s.slice(0, 16).replace("T", " ") : "—");

export async function loader({ request, params }: Route.LoaderArgs) {
  const { role } = await requireRefundStaff(request);
  const detail = await getRefundDetail(params.refundId ?? "");
  if (!detail) throw data("환불건을 찾을 수 없습니다.", { status: 404 });
  return { detail, role };
}

export async function action({ request, params }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const refundId = params.refundId ?? "";

  // ★확정·되돌리기는 원장 전용(요청서 §10). 나머지 진행은 담당자도 할 수 있다.
  const needsAdmin = intent === "commit" || intent === "reopen";
  const { user } = needsAdmin
    ? await requireRefundAdmin(request)
    : await requireRefundStaff(request);

  const detail = await getRefundDetail(refundId);
  if (!detail) return data({ error: "환불건을 찾을 수 없습니다." }, { status: 404 });

  if (intent === "amounts") {
    const ids = form.getAll("refundItemId").map(String);
    const res = await saveRefundAmounts({
      refundId,
      amounts: ids.map((id) => ({
        refundItemId: id,
        finalKrw: Number(form.get(`final_${id}`) ?? 0),
        deductionReason: String(form.get(`reason_${id}`) ?? "").trim() || null,
      })),
      couponRestored: form.get("couponRestored") === "on",
      refundMethod: String(form.get("refundMethod") ?? "original"),
      adminMemo: String(form.get("adminMemo") ?? "").trim() || null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: `환불금액 ${res.total.toLocaleString("ko-KR")}원으로 저장했습니다.` });
  }

  if (intent === "pg") {
    const res = await savePgCancel({
      refundId,
      cancelKrw: Number(form.get("pgCancelKrw") ?? 0),
      cancelKind: form.get("pgCancelKind") === "partial" ? "partial" : "full",
      cancelledAt: String(form.get("pgCancelledAt") ?? ""),
      transactionNo: String(form.get("pgTransactionNo") ?? ""),
      operatorId: user.id,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: "취소결과를 저장했습니다." });
  }

  if (intent === "status" || intent === "reopen") {
    const to = String(form.get("to") ?? "") as RefundStatus;
    const memo = String(form.get("memo") ?? "").trim() || null;
    const check = checkRefundTransition(detail.status, to, {
      originalPaidKrw: detail.originalPaidKrw,
      priorRefundedKrw: detail.priorRefundedKrw,
      thisRefundKrw: detail.thisRefundKrw,
      pg: {
        cancelKrw: detail.pgCancelKrw,
        cancelledAt: detail.pgCancelledAt,
        transactionNo: detail.pgTransactionNo,
        operatorId: detail.pgOperatorName ? "set" : null,
      },
      actorIsAdmin: needsAdmin,
      editReason: memo,
    });
    if (!check.ok) return data({ error: check.error }, { status: 400 });
    const res = await setRefundStatus({
      refundId,
      status: to,
      actorId: user.id,
      memo,
      allowReopen: intent === "reopen",
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    return data({ ok: `${REFUND_STATUS_LABELS[to]}(으)로 바꿨습니다.` });
  }

  if (intent === "commit") {
    const res = await commitRefund({
      refundId,
      actorId: user.id,
      memo: String(form.get("memo") ?? "").trim() || null,
    });
    if (!res.ok) return data({ error: res.error }, { status: 400 });
    const bits = [
      res.idempotent ? "이미 처리된 건입니다." : "환불을 확정했습니다.",
      res.pointReturnedKrw > 0 ? `포인트 ${res.pointReturnedKrw.toLocaleString("ko-KR")}P 반환` : "",
      res.pointRevokedKrw > 0 ? `적립 ${res.pointRevokedKrw.toLocaleString("ko-KR")}P 회수` : "",
      res.pointRevokeShortfallKrw > 0
        ? `★잔액 부족으로 ${res.pointRevokeShortfallKrw.toLocaleString("ko-KR")}P 회수 못 함`
        : "",
      res.couponRestored > 0 ? "쿠폰 복원" : "",
    ].filter(Boolean);
    return data({ ok: bits.join(" · ") });
  }

  return data({ error: "알 수 없는 요청입니다." }, { status: 400 });
}

export default function AdminRefundDetail({ loaderData, actionData }: Route.ComponentProps) {
  const { detail, role } = loaderData;
  const msg = actionData && "ok" in actionData ? actionData.ok : null;
  const err = actionData && "error" in actionData ? actionData.error : null;

  const o = detail.order;
  const isBank = detail.refundMethod === "bank" || detail.refundMethod === "etc";
  const pgLabel = isBank ? "이체" : "토스";
  const itemsTotal = detail.items.reduce((s, i) => s + (i.finalKrw ?? 0), 0);
  const remaining = remainingRefundableKrw({
    originalPaidKrw: detail.originalPaidKrw,
    priorRefundedKrw: detail.priorRefundedKrw,
  });
  const doneTarget = resolveDoneStatus({
    originalPaidKrw: detail.originalPaidKrw,
    priorRefundedKrw: detail.priorRefundedKrw,
    thisRefundKrw: detail.thisRefundKrw,
  });
  const closed = !!detail.closedAt;
  // 진행 버튼 — 전이표에서 가져와 가드로 한 번 더 거른다(표는 한 곳에만 둔다).
  const nextSteps = REFUND_TRANSITIONS[detail.status].filter(
    (s) => s !== "partial_done" && s !== "full_done",
  );

  return (
    <AdminShell
      cluster="sales"
      role={role}
      width={1100}
      title={
        <span className="inline-flex items-center gap-2">
          환불 상세
          <Chip tone={closed ? "emerald" : "amber"}>
            {REFUND_STATUS_LABELS[detail.status]}
          </Chip>
        </span>
      }
      desc={`${o.userName || "회원"} · 주문 ${o.orderId.slice(0, 8)} · 접수 ${dt(detail.intakeAt)}`}
      headerRight={
        <Link
          to="/admin/refunds"
          className="text-link text-xs font-semibold hover:underline"
        >
          목록으로
        </Link>
      }
    >
      {msg ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{err}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* 블록 1 — 전체 주문정보 */}
          <Card title="전체 주문정보">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
              <Row label="회원" value={o.userName || "—"} />
              <Row label="주문번호" value={o.orderId.slice(0, 8)} mono />
              <Row label="결제일시" value={dt(o.paidAt)} />
              <Row label="결제금액" value={won(o.totalKrw)} mono />
              <Row label="배송비" value={won(o.shippingFeeKrw)} mono />
              <Row label="쿠폰 할인액" value={won(o.couponDiscountKrw)} mono />
              <Row label="사용 포인트" value={won(o.pointAmountKrw)} mono />
              <Row label="결제수단" value={o.paymentMethod === "toss" ? "토스" : "무통장"} />
              <Row label="주문상태" value={o.status} />
              <Row label="누적 환불액" value={won(detail.priorRefundedKrw)} mono />
              <Row label="남은 환불 가능금액" value={won(remaining)} mono />
            </dl>
          </Card>

          {/* 블록 2 — 정상거래 PG 정보 */}
          <Card title="정상거래 PG 정보">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
              <Row label="PG사" value={o.paymentMethod === "toss" ? "토스페이먼츠" : "—"} />
              <Row label="결제키" value={o.payment?.paymentKey?.slice(0, 20) ?? "—"} mono />
              <Row label="결제상태" value={o.payment?.status ?? "—"} />
              <Row label="PG 누적 환불액" value={won(o.payment?.refundAmountKrw)} mono />
            </dl>
          </Card>

          {/* 블록 3·4 — 대상상품 + 환불금액 */}
          <Card
            title="환불 대상상품 · 환불금액"
            hint="상품별 실제 환불금액을 입력하면 합계가 이번 환불금액이 됩니다. 수강분 공제 자동계산은 다음 단계(P7)에서 붙습니다."
          >
            <Form method="post" className="flex flex-col gap-3">
              <input type="hidden" name="intent" value="amounts" />
              {detail.items.map((i) => (
                <div
                  key={i.refundItemId}
                  className="border-border/60 grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_140px_1fr]"
                >
                  <input type="hidden" name="refundItemId" value={i.refundItemId} />
                  <div className="flex flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium">{i.label}</span>
                    <span className="text-muted-foreground text-[11px] tabular-nums">
                      수량 {i.quantity} · 정가 {won(i.unitPriceKrw * i.quantity)}
                      {i.paidAmountKrw != null ? ` · 실결제 ${won(i.paidAmountKrw)}` : ""}
                    </span>
                  </div>
                  <Field label="환불금액" htmlFor={`final_${i.refundItemId}`}>
                    <input
                      id={`final_${i.refundItemId}`}
                      name={`final_${i.refundItemId}`}
                      type="number"
                      min={0}
                      step={1}
                      disabled={closed}
                      defaultValue={i.finalKrw ?? i.paidAmountKrw ?? ""}
                      className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-right text-[13px] tabular-nums outline-none"
                    />
                  </Field>
                  <Field label="공제사유" htmlFor={`reason_${i.refundItemId}`}>
                    <input
                      id={`reason_${i.refundItemId}`}
                      name={`reason_${i.refundItemId}`}
                      disabled={closed}
                      defaultValue={i.deductionReason ?? ""}
                      maxLength={200}
                      className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                    />
                  </Field>
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="환불방법" htmlFor="refundMethod">
                  <select
                    id="refundMethod"
                    name="refundMethod"
                    disabled={closed}
                    defaultValue={detail.refundMethod ?? "original"}
                    className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                  >
                    {REFUND_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {REFUND_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="쿠폰 복원" hint="전액 환불일 때만 실제로 복원됩니다.">
                  <label className="inline-flex h-9 items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      name="couponRestored"
                      disabled={closed || o.couponDiscountKrw <= 0}
                      defaultChecked={detail.couponRestored}
                      className="size-4"
                    />
                    사용한 쿠폰을 되돌린다
                  </label>
                </Field>
                <Field label="관리자 메모" htmlFor="adminMemo">
                  <input
                    id="adminMemo"
                    name="adminMemo"
                    disabled={closed}
                    defaultValue={detail.adminMemo ?? ""}
                    maxLength={500}
                    className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                  />
                </Field>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px]">
                  <span className="text-muted-foreground">저장된 이번 환불금액 </span>
                  <strong className="tabular-nums">{won(detail.thisRefundKrw)}</strong>
                  <span className="text-muted-foreground"> · 입력 합계 </span>
                  <strong className="tabular-nums">{won(itemsTotal)}</strong>
                </p>
                <Button type="submit" size="sm" variant="secondary" disabled={closed}>
                  환불금액 저장
                </Button>
              </div>
            </Form>
          </Card>

          {/* 블록 5 — 취소결과 입력 */}
          <Card
            title={`${pgLabel} 취소결과 입력`}
            hint={
              isBank
                ? "계좌로 이체한 뒤 이체 정보를 적어 주세요. 네 값이 다 차야 환불완료로 처리할 수 있습니다."
                : "토스 상점관리자에서 전체취소 또는 부분취소를 먼저 처리한 뒤 취소정보를 입력해 주세요."
            }
          >
            <Form method="post" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="intent" value="pg" />
              <Field label={`실제 ${isBank ? "이체" : "취소"}금액`} required htmlFor="pgCancelKrw">
                <input
                  id="pgCancelKrw"
                  name="pgCancelKrw"
                  type="number"
                  min={0}
                  disabled={closed}
                  defaultValue={detail.pgCancelKrw ?? detail.thisRefundKrw ?? ""}
                  className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-right text-[13px] tabular-nums outline-none"
                />
              </Field>
              <Field label="전체 / 부분" htmlFor="pgCancelKind">
                <select
                  id="pgCancelKind"
                  name="pgCancelKind"
                  disabled={closed}
                  defaultValue={detail.pgCancelKind ?? (doneTarget === "full_done" ? "full" : "partial")}
                  className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                >
                  <option value="full">전체취소</option>
                  <option value="partial">부분취소</option>
                </select>
              </Field>
              <Field label={`${pgLabel} ${isBank ? "이체" : "취소"}일시`} required htmlFor="pgCancelledAt">
                <input
                  id="pgCancelledAt"
                  name="pgCancelledAt"
                  type="datetime-local"
                  disabled={closed}
                  defaultValue={detail.pgCancelledAt?.slice(0, 16) ?? ""}
                  className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                />
              </Field>
              <Field
                label={isBank ? "이체 참조번호" : "토스 거래번호 / 취소번호"}
                required
                htmlFor="pgTransactionNo"
              >
                <input
                  id="pgTransactionNo"
                  name="pgTransactionNo"
                  disabled={closed}
                  defaultValue={detail.pgTransactionNo ?? ""}
                  maxLength={100}
                  className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                />
              </Field>
              <p className="text-muted-foreground text-[11px] sm:col-span-2">
                처리담당자는 저장하는 관리자로 기록됩니다
                {detail.pgOperatorName ? ` (현재: ${detail.pgOperatorName})` : ""}.
              </p>
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" variant="secondary" disabled={closed}>
                  취소결과 저장
                </Button>
              </div>
            </Form>
          </Card>
        </div>

        {/* 오른쪽 — 처리 + 이력 */}
        <div className="flex flex-col gap-4">
          <Card title="접수 정보">
            <dl className="flex flex-col gap-2 text-[13px]">
              <Row label="접수경로" value={detail.intakeChannel ?? "—"} />
              <Row label="접수담당자" value={detail.intakeByName ?? "—"} />
              <Row label="요청사유" value={detail.requestReason ?? "—"} />
              <Row label="상담내용" value={detail.consultNote ?? "—"} />
            </dl>
          </Card>

          <Card title="처리">
            {closed ? (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground text-[12px]">
                  종결된 건입니다 ({dt(detail.closedAt)}).
                </p>
                {isMoneyMovedStatus(detail.status) ? (
                  <Form method="post" className="flex flex-col gap-2">
                    <input type="hidden" name="intent" value="reopen" />
                    <input type="hidden" name="to" value="reviewing" />
                    <Field label="수정사유" required htmlFor="reopenMemo">
                      <input
                        id="reopenMemo"
                        name="memo"
                        required
                        maxLength={200}
                        className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                      />
                    </Field>
                    <Button type="submit" size="sm" variant="outline">
                      원장 권한으로 되돌리기
                    </Button>
                  </Form>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="status" />
                    <input type="hidden" name="to" value="reviewing" />
                    <Button type="submit" size="sm" variant="outline">
                      다시 검토
                    </Button>
                  </Form>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <Form method="post" className="flex flex-col gap-2">
                  <input type="hidden" name="intent" value="status" />
                  <Field label="메모" htmlFor="stepMemo">
                    <input
                      id="stepMemo"
                      name="memo"
                      maxLength={200}
                      placeholder="이력에 함께 남습니다"
                      className="border-input bg-background focus:border-primary h-9 rounded-md border px-3 text-[13px] outline-none"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-1.5">
                    {nextSteps.map((s) => (
                      <Button key={s} type="submit" name="to" value={s} size="sm" variant="outline">
                        {REFUND_STATUS_LABELS[s]}
                      </Button>
                    ))}
                  </div>
                </Form>

                {detail.status === "pg_done" && doneTarget ? (
                  <Form
                    method="post"
                    className="border-border/60 flex flex-col gap-2 border-t pt-3"
                    onSubmit={(e) => {
                      // 요청서 §10 — 환불완료 상태 변경 전 확인창.
                      if (
                        !window.confirm(
                          `${won(detail.thisRefundKrw)}을 환불 확정합니다.\n수강권 회수·포인트 반환·쿠폰 복원이 함께 처리되며 되돌리려면 원장 권한이 필요합니다.\n계속할까요?`,
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="intent" value="commit" />
                    <Button type="submit" size="sm">
                      {REFUND_STATUS_LABELS[doneTarget]}로 확정
                    </Button>
                    <p className="text-muted-foreground text-[11px]">
                      원장만 누를 수 있습니다.
                    </p>
                  </Form>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="처리 이력">
            <ol className="flex flex-col gap-2 text-[12px]">
              {detail.logs.map((l) => (
                <li key={l.logId} className="border-border/60 border-b pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {l.fromStatus
                        ? `${REFUND_STATUS_LABELS[l.fromStatus as RefundStatus] ?? l.fromStatus} → `
                        : ""}
                      {REFUND_STATUS_LABELS[l.toStatus as RefundStatus] ?? l.toStatus}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{dt(l.createdAt)}</span>
                  </div>
                  <p className="text-muted-foreground">
                    {l.actorName ?? "자동 처리"}
                    {l.memo ? ` · ${l.memo}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-xl border p-4 shadow-sm">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint ? <p className="text-muted-foreground mb-3 text-[11px]">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
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
