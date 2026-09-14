// 결제 복귀 판정 테스트 (feat-11-012 P5).
//
// ★고치기 전 증상: 실패 복귀 6곳이 파라미터를 붙여 보내는데 **읽는 화면이 한 곳도 없었다.**
//   게다가 토스가 스스로 붙이는 code·message(= 실패 사유)도 그대로 버려졌다.

import { describe, expect, it } from "vitest";

import {
  PAYMENT_RETURN,
  PAYMENT_RETURN_PARAMS,
  paymentFailPath,
  readPaymentReturn,
} from "./payment-return";

const sp = (q: string) => new URLSearchParams(q);

describe("paymentFailPath", () => {
  it("경로에 실패 표시를 붙인다", () => {
    expect(paymentFailPath("/lecture/cart")).toBe("/lecture/cart?failed=1");
  });

  it("이미 쿼리가 있으면 & 로 잇는다", () => {
    expect(paymentFailPath("/lecture/news?kind=notice")).toBe(
      "/lecture/news?kind=notice&failed=1",
    );
  });
});

describe("readPaymentReturn", () => {
  it("아무 표시도 없으면 null — 알림을 띄우지 않는다", () => {
    expect(readPaymentReturn(sp(""))).toBeNull();
    expect(readPaymentReturn(sp("tab=problems"))).toBeNull();
  });

  it("성공·가상계좌·실패를 가른다", () => {
    expect(readPaymentReturn(sp("purchased=1"))?.kind).toBe("paid");
    expect(readPaymentReturn(sp("deposit=1"))?.kind).toBe("deposit");
    expect(readPaymentReturn(sp("failed=1"))?.kind).toBe("failed");
  });

  it("우리 사유(msg)를 읽는다", () => {
    expect(readPaymentReturn(sp("failed=1&msg=카드+한도+초과"))?.message).toBe(
      "카드 한도 초과",
    );
  });

  it("★토스가 붙여 보낸 사유(code+message)도 읽는다 — 종전에는 버려졌다", () => {
    const r = readPaymentReturn(
      sp("code=PAY_PROCESS_CANCELED&message=사용자가+결제를+취소했습니다"),
    );
    expect(r?.kind).toBe("failed");
    expect(r?.message).toBe("사용자가 결제를 취소했습니다");
  });

  it("code 만 있으면 실패로 보지 않는다 — 다른 화면의 code 파라미터 오인 방지", () => {
    expect(readPaymentReturn(sp("code=abc"))).toBeNull();
  });

  it("우리 msg 가 토스 message 보다 앞선다", () => {
    const r = readPaymentReturn(sp("failed=1&msg=우리문구&message=토스문구"));
    expect(r?.message).toBe("우리문구");
  });

  it("지울 파라미터 목록에 우리 것과 토스 것이 모두 들어 있다", () => {
    for (const k of [
      PAYMENT_RETURN.paid,
      PAYMENT_RETURN.failed,
      PAYMENT_RETURN.deposit,
      PAYMENT_RETURN.message,
      "code",
      "message",
    ]) {
      expect(PAYMENT_RETURN_PARAMS, k).toContain(k);
    }
  });
});
