// feat-11-014 Q2 — 주문 상태 변경 셀렉트 + 사유 확인 다이얼로그 (표시·이벤트만).
//
// ★값을 고른다고 바로 저장하지 않는다. 고르면 확인 다이얼로그(전/후 라벨 · 사유 필수)를
//   띄우고, 확인해야 fetcher 가 intent="set_status" 를 보낸다(설계 D2). 저장 전 DB 무변경.
// ★허용 전이 계산은 `lib/order-status.ts`(allowedAdminOrderActions)가 소유하고 서버가 같은
//   표로 재검증한다. 여기서는 그 결과를 옵션으로 보여 주기만 한다.
// ★window.confirm / prompt 를 쓰지 않는다 — 사유가 이력 원장(order_status_logs)에 남아야 한다.
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Textarea } from "~/core/components/ui/textarea";
import { AdminSelect, Field } from "~/features/admin/components/admin-ui";
import {
  ADMIN_ONLY_ORDER_ACTIONS,
  ADMIN_ORDER_ACTION_LABEL,
  type AdminOrderAction,
  MIN_ORDER_STATUS_REASON_LENGTH,
  adminOrderStatusLabel,
  allowedAdminOrderActions,
} from "~/features/orders/lib/order-status";
import {
  REFUND_METHODS,
  REFUND_METHOD_LABELS,
  type RefundMethod,
} from "~/features/refunds/lib/refund-status";

/** 화면 → 액션 intent. 화면(action)과 컴포넌트가 같은 문자열을 쓴다. */
export const SET_STATUS_INTENT = "set_status";
/** 사유 최소 길이는 lib SSOT(MIN_ORDER_STATUS_REASON_LENGTH). 최대 길이만 여기서 정한다. */
export const REASON_MAX_LENGTH = 300;
/** 환불완료 처리 근거(송금번호 등) 최대 길이. */
export const EVIDENCE_MAX_LENGTH = 100;
/**
 * 환불완료(장부 정리)에서 고를 수 있는 환불 방법 — 환불 도메인 SSOT(refund-status.ts)의
 * **부분집합**이다. PG 취소가 없는 경로라 `original`(원결제수단 취소)만 뺀다.
 * ★값·라벨을 여기서 다시 선언하지 않는다 — 서버 성공 문구(REFUND_METHOD_LABELS)와 같은 말을 쓴다.
 */
export type ShortcutRefundMethod = Exclude<RefundMethod, "original">;
export function isShortcutRefundMethod(
  m: RefundMethod,
): m is ShortcutRefundMethod {
  return m !== "original";
}
const SHORTCUT_REFUND_METHODS = REFUND_METHODS.filter(isShortcutRefundMethod);
const DEFAULT_REFUND_METHOD: ShortcutRefundMethod = "bank";

/** 오류가 붙는 자리 — 입력 검증은 해당 칸 아래에, 서버 오류는 폼 하단(form)에 보인다. */
type FieldErrorKey = "reason" | "refundKrw" | "evidenceNo" | "form";
type FieldError = { key: FieldErrorKey; message: string };

/** 확인 다이얼로그에 넣는 액션별 안내문 — 취소·환불완료 문구는 요청서·설계 D1 그대로. */
const ACTION_NOTICE: Record<AdminOrderAction, string> = {
  reopen_deposit: "무통장 입금 대기로 되돌리고 입금 기한을 다시 엽니다.",
  confirm_deposit: "입금 확인 즉시 수강권·교재 지급이 실행됩니다.",
  cancel:
    "결제 전 주문만 취소됩니다. 예약된 포인트는 돌려주고 무통장 입금 기한은 종료됩니다. 결제창을 연 지 30분이 지나지 않은 주문은 결제가 끝날 수 있어 취소되지 않습니다.",
  refund_complete:
    "PG 취소는 하지 않습니다 — 이미 밖에서 돌려준 전액의 장부 정리입니다. 강의 수강권·재고·쿠폰·포인트가 회수됩니다. 학습 플랫폼 구독형(과목·번들·회원제) 수강권은 여기서 회수되지 않으니 수강권 관리에서 따로 종료하세요.",
  archive:
    "목록에서 숨깁니다. 삭제가 아니며 「보관함」 필터에서 다시 볼 수 있습니다. 결제창을 연 지 30분이 지나지 않은 주문은 만료된 뒤에 보관할 수 있습니다.",
  unarchive: "보관을 풀고 기본 목록에 다시 보입니다.",
};

const PLACEHOLDER = "상태 변경…";

type SetStatusResult = { ok?: boolean; detail?: string; error?: string };

export function OrderStatusSelect({
  order,
  role,
}: {
  order: {
    orderId: string;
    orderNo: string;
    status: string;
    paymentMethod: string | null;
    archivedAt: string | null;
    /** 주문 total − 완료된 환불 합. 환불완료 실환급액의 기본값. */
    remainingRefundableKrw: number;
    /**
     * 「항목 환불」(refundOrderItem)로 환불됐지만 환불 도메인(refunds)에 기록이 없는 상품 수.
     * ★0 이 아니면 환불완료 단축은 서버 합계 검증(귀속액 합 ≠ 남은 금액)에 반드시 걸린다 —
     *   옵션을 감추고 「환불신청」(환불관리)으로 보낸다. 잔액 표시도 그 평면을 못 세므로 정직하게 감춘다.
     */
    legacyItemRefundCount: number;
  };
  role: string;
}) {
  const fetcher = useFetcher<SetStatusResult>();
  const busy = fetcher.state !== "idle";

  // ★원장 전용 액션은 화면에서도 감춘다(서버가 막지만 보이지 않게 — 요청서 권한 표).
  // ★레거시 항목 환불이 섞인 주문은 환불완료 단축이 막다른 길이라 옵션에서 뺀다(서버도 거부한다).
  const options = allowedAdminOrderActions(order).filter(
    (a) =>
      (role === "admin" || !ADMIN_ONLY_ORDER_ACTIONS.includes(a)) &&
      (a !== "refund_complete" || order.legacyItemRefundCount === 0),
  );

  const [pending, setPending] = useState<AdminOrderAction | null>(null);
  const [reason, setReason] = useState("");
  const [refundKrw, setRefundKrw] = useState("");
  const [evidenceNo, setEvidenceNo] = useState("");
  const [method, setMethod] = useState<ShortcutRefundMethod>(
    DEFAULT_REFUND_METHOD,
  );
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const errorFor = (key: FieldErrorKey) =>
    fieldError?.key === key ? fieldError.message : undefined;

  const reset = () => {
    setPending(null);
    setReason("");
    setRefundKrw("");
    setEvidenceNo("");
    setMethod(DEFAULT_REFUND_METHOD);
    setFieldError(null);
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if (fetcher.data.error) {
      setFieldError({ key: "form", message: fetcher.data.error });
      toast.error(fetcher.data.error);
    } else if (fetcher.data.ok) {
      toast.success(fetcher.data.detail ?? "주문 상태를 변경했습니다.");
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const pick = (value: string) => {
    const action = options.find((a) => a === value);
    if (!action) return;
    setPending(action);
    setReason("");
    setRefundKrw(String(order.remainingRefundableKrw));
    setEvidenceNo("");
    setMethod(DEFAULT_REFUND_METHOD);
    setFieldError(null);
  };

  const pickMethod = (value: string) => {
    const m = SHORTCUT_REFUND_METHODS.find((x) => x === value);
    if (m) setMethod(m);
  };

  const isRefund = pending === "refund_complete";

  const submit = () => {
    if (!pending) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < MIN_ORDER_STATUS_REASON_LENGTH) {
      setFieldError({
        key: "reason",
        message: `사유를 ${MIN_ORDER_STATUS_REASON_LENGTH}자 이상 입력해 주세요.`,
      });
      return;
    }
    const fd = new FormData();
    fd.set("intent", SET_STATUS_INTENT);
    fd.set("orderId", order.orderId);
    fd.set("action", pending);
    fd.set("reason", trimmedReason);
    if (isRefund) {
      const krw = Number(refundKrw);
      if (!Number.isInteger(krw) || krw < 1) {
        setFieldError({
          key: "refundKrw",
          message: "실환급액은 1원 이상의 정수여야 합니다.",
        });
        return;
      }
      if (!evidenceNo.trim()) {
        setFieldError({
          key: "evidenceNo",
          message: "처리 근거(송금번호 등)를 입력해 주세요.",
        });
        return;
      }
      fd.set("refundKrw", String(krw));
      fd.set("evidenceNo", evidenceNo.trim());
      fd.set("method", method);
    }
    setFieldError(null);
    fetcher.submit(fd, { method: "post" });
  };

  const currentLabel = adminOrderStatusLabel(order.status);

  return (
    <>
      <AdminSelect
        aria-label="상태 변경"
        value={pending ?? ""}
        onChange={(e) => pick(e.target.value)}
        disabled={busy || options.length === 0}
        className="h-7 px-2 text-[11px]"
      >
        <option value="">{PLACEHOLDER}</option>
        {options.map((a) => (
          <option key={a} value={a}>
            {ADMIN_ORDER_ACTION_LABEL[a]}
          </option>
        ))}
      </AdminSelect>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => (!open && !busy ? reset() : undefined)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              주문 {order.orderNo} —{" "}
              {pending ? ADMIN_ORDER_ACTION_LABEL[pending] : ""}
            </DialogTitle>
            <DialogDescription>
              <span className="font-semibold">{currentLabel}</span>
              {" → "}
              <span className="font-semibold">
                {pending ? ADMIN_ORDER_ACTION_LABEL[pending] : ""}
              </span>
              {pending ? (
                <>
                  <br />
                  {ACTION_NOTICE[pending]}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {isRefund ? (
              <>
                <Field
                  label="실환급액(원)"
                  required
                  htmlFor="order-status-refund-krw"
                  hint={`환불 가능 잔액 ₩${order.remainingRefundableKrw.toLocaleString("ko-KR")}`}
                  error={errorFor("refundKrw")}
                >
                  <Input
                    id="order-status-refund-krw"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={refundKrw}
                    onChange={(e) => setRefundKrw(e.target.value)}
                    disabled={busy}
                  />
                </Field>
                <Field
                  label="처리 근거(송금번호 등)"
                  required
                  htmlFor="order-status-evidence"
                  error={errorFor("evidenceNo")}
                >
                  <Input
                    id="order-status-evidence"
                    value={evidenceNo}
                    onChange={(e) => setEvidenceNo(e.target.value)}
                    maxLength={EVIDENCE_MAX_LENGTH}
                    placeholder="예) 2026-09-17 국민은행 송금 123456"
                    disabled={busy}
                  />
                </Field>
                <Field label="환불 방법" required htmlFor="order-status-method">
                  <AdminSelect
                    id="order-status-method"
                    value={method}
                    onChange={(e) => pickMethod(e.target.value)}
                    disabled={busy}
                  >
                    {SHORTCUT_REFUND_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {REFUND_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </AdminSelect>
                </Field>
              </>
            ) : null}
            <Field
              label="사유"
              required
              htmlFor="order-status-reason"
              hint={`${MIN_ORDER_STATUS_REASON_LENGTH}자 이상. 변경 이력에 남습니다.`}
              error={errorFor("reason")}
            >
              <Textarea
                id="order-status-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX_LENGTH}
                rows={3}
                placeholder="예) 학생 요청으로 입금 기한 연장 재접수"
                className="resize-none"
                disabled={busy}
              />
            </Field>
            {/* 서버가 돌려준 오류 — 특정 칸이 아니라 처리 전체에 대한 말이라 폼 하단에 둔다. */}
            {errorFor("form") ? (
              <p
                role="alert"
                className="text-[11px] leading-relaxed text-rose-600"
              >
                {errorFor("form")}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              disabled={busy}
            >
              취소
            </Button>
            <Button type="button" onClick={submit} disabled={busy}>
              {pending ? `${ADMIN_ORDER_ACTION_LABEL[pending]} 처리` : "확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
