// 토스 웹훅 수신 — 가상계좌 입금·결제취소·환불 동기화.
// 토스 개발자센터에 https://{도메인}/api/payments/toss/webhook 등록.
//
// 페이로드는 신뢰하지 않는다 — orderId 만 뽑아 syncPaymentFromToss 가
// 토스 조회 API 로 권위 상태를 재확인 후 반영(webhook.server.ts 참고).
// 응답: 반영/무시=200(재전송 중단), 일시 오류=500(토스가 재시도).

import { data } from "react-router";

import { syncPaymentFromToss } from "~/features/subscriptions/webhook.server";

import type { Route } from "./+types/toss-webhook";

function extractOrderId(body: Record<string, unknown>): string | null {
  // PAYMENT_STATUS_CHANGED 류: { eventType, data: { orderId, ... } }
  const inner = body.data;
  if (inner && typeof inner === "object") {
    const v = (inner as Record<string, unknown>).orderId;
    if (typeof v === "string" && v.length > 0) return v;
  }
  // DEPOSIT_CALLBACK(가상계좌): { orderId, status, secret, ... } 평면 구조.
  if (typeof body.orderId === "string" && body.orderId.length > 0) {
    return body.orderId;
  }
  return null;
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "POST only" }, { status: 405 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return data({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const orderId = extractOrderId(body);
  const eventType =
    typeof body.eventType === "string"
      ? body.eventType
      : typeof body.status === "string"
        ? "DEPOSIT_CALLBACK"
        : "UNKNOWN";
  if (!orderId) {
    // orderId 없는 이벤트(빌링키 상태 변경 등)는 처리 대상 아님 — 200 으로 종결.
    return data({ ok: true, outcome: "ignored" });
  }

  const result = await syncPaymentFromToss(orderId, eventType, body);
  // 토스 API 일시 실패만 500 → 토스 재시도. 나머지는 200 으로 재전송 중단.
  if (result.outcome === "error") {
    return data({ ok: false, outcome: "error" }, { status: 500 });
  }
  return data({ ok: true, outcome: result.outcome });
}

// 헬스체크(브라우저 확인)용 — 등록 URL 오타 점검.
export async function loader() {
  return data({ ok: true, hint: "토스 웹훅은 POST 로 수신합니다." });
}
