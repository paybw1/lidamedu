// 주문 상태 표기 테스트 (feat-11-012 P6-c).
//
// ★못박는 것: **서버가 실제로 쓰는 값**이 전부 한글로 나온다는 것. 종전에는 학생 화면 표에
//   attempted·expired 가 없어 원시 영문이 학생에게 그대로 노출됐다.

import { describe, expect, it } from "vitest";

import {
  HIDDEN_FROM_STUDENT,
  HIDDEN_FROM_STUDENT_FILTER,
  ORDER_STATUSES,
  orderStatusLabel,
  paymentMethodLabel,
} from "./order-status";

// 서버 코드가 orders.status 에 실제로 쓰는 값(2026-09-14 전수 조사).
const SERVER_WRITES = [
  "attempted",
  "pending_deposit",
  "paid",
  "partially_refunded",
  "refunded",
  "cancelled",
  "expired",
] as const;

describe("orderStatusLabel", () => {
  it("★서버가 쓰는 값이 전부 한글이다 — 원시 영문이 새지 않는다", () => {
    for (const s of SERVER_WRITES) {
      const label = orderStatusLabel(s);
      expect(label).not.toBe(s);
      expect(/^[a-z_]+$/.test(label)).toBe(false);
    }
  });

  it("★종전에 빠져 있던 두 값", () => {
    expect(orderStatusLabel("attempted")).toBe("결제 진행 중");
    expect(orderStatusLabel("expired")).toBe("기한 만료");
  });

  it("허용값 전체에 문구가 있다(CHECK 제약 10값)", () => {
    expect(ORDER_STATUSES).toHaveLength(10);
    for (const s of ORDER_STATUSES) {
      expect(orderStatusLabel(s).length).toBeGreaterThan(0);
    }
  });

  it("모르는 값이 와도 원시코드를 내보내지 않는다", () => {
    expect(orderStatusLabel("weird_new_status")).not.toContain("weird");
  });
});

describe("학생 목록에서 감추는 상태", () => {
  it("결제창까지만 갔다 끝난 건은 학생에게 주문이 아니다", () => {
    expect(HIDDEN_FROM_STUDENT).toContain("attempted");
    expect(HIDDEN_FROM_STUDENT).toContain("expired");
    expect(HIDDEN_FROM_STUDENT).toContain("draft");
  });
  it("결제된 건·환불 건은 감추지 않는다", () => {
    expect(HIDDEN_FROM_STUDENT).not.toContain("paid");
    expect(HIDDEN_FROM_STUDENT).not.toContain("refunded");
    expect(HIDDEN_FROM_STUDENT).not.toContain("pending_deposit");
  });
  it("PostgREST 필터 문자열 모양", () => {
    expect(HIDDEN_FROM_STUDENT_FILTER).toBe(
      "(draft,attempted,pending_payment,expired)",
    );
  });
});

describe("paymentMethodLabel", () => {
  it("★종전에 빠져 있던 manual", () => {
    expect(paymentMethodLabel("manual")).toBe("운영자 처리");
  });
  it("나머지 수단", () => {
    expect(paymentMethodLabel("toss")).toBe("카드·간편결제");
    expect(paymentMethodLabel("bank_transfer")).toBe("무통장 입금");
    expect(paymentMethodLabel("free")).toBe("무료");
  });
  it("없거나 모르는 값은 - 로", () => {
    expect(paymentMethodLabel(null)).toBe("-");
    expect(paymentMethodLabel("card")).toBe("-"); // 도메인에 없던 죽은 키
  });
});
