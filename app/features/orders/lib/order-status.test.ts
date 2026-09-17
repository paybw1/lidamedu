// 주문 상태 표기 테스트 (feat-11-012 P6-c).
//
// ★못박는 것: **서버가 실제로 쓰는 값**이 전부 한글로 나온다는 것. 종전에는 학생 화면 표에
//   attempted·expired 가 없어 원시 영문이 학생에게 그대로 노출됐다.
import { describe, expect, it } from "vitest";

import {
  ADMIN_ONLY_ORDER_ACTIONS,
  ADMIN_ORDER_ACTIONS,
  ADMIN_ORDER_ACTION_LABEL,
  ADMIN_ORDER_STATUS_LABEL,
  ADMIN_ORDER_STATUS_TONE,
  ARCHIVABLE_ORDER_STATUSES,
  ARCHIVE_LOG_STATUS,
  ARCHIVE_LOG_STATUS_LABEL,
  type AdminOrderAction,
  BANK_TRANSFER_PAYMENT_METHOD,
  HIDDEN_FROM_STUDENT,
  HIDDEN_FROM_STUDENT_FILTER,
  ORDER_STATUSES,
  type OrderStatus,
  adminOrderStatusLabel,
  allowedAdminOrderActions,
  orderStatusLabel,
  orderStatusLogLabel,
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

// ── 운영자 표기·상태 변경 셀렉트 (feat-11-014 Q1·D1) ────────────────────────

describe("운영자 표기", () => {
  it("10값 전부 라벨·톤이 있고, 학생 표와 다른 말을 쓰는 값이 실제로 있다", () => {
    for (const s of ORDER_STATUSES) {
      expect(ADMIN_ORDER_STATUS_LABEL[s].length).toBeGreaterThan(0);
      expect(ADMIN_ORDER_STATUS_TONE[s]).toBeTruthy();
      expect(adminOrderStatusLabel(s)).toBe(ADMIN_ORDER_STATUS_LABEL[s]);
    }
    // 종전 admin-orders.tsx 표를 그대로 옮겼다 — 학생 표와 뜻이 갈리는 두 값.
    expect(ADMIN_ORDER_STATUS_LABEL.draft).toBe("장바구니");
    expect(ADMIN_ORDER_STATUS_LABEL.attempted).toBe("결제시도");
    expect(orderStatusLabel("draft")).not.toBe(ADMIN_ORDER_STATUS_LABEL.draft);
  });

  it("모르는 값이 와도 원시코드를 내보내지 않는다", () => {
    expect(adminOrderStatusLabel("weird_new_status")).not.toContain("weird");
  });

  it("셀렉트 6액션 전부 라벨이 있고, 원장 결정 A1·A2 의 문구를 쓴다", () => {
    expect(ADMIN_ORDER_ACTIONS).toHaveLength(6);
    for (const a of ADMIN_ORDER_ACTIONS) {
      expect(ADMIN_ORDER_ACTION_LABEL[a].length).toBeGreaterThan(0);
    }
    expect(ADMIN_ORDER_ACTION_LABEL.reopen_deposit).toBe("입금대기"); // 「주문접수」 아님
    expect(ADMIN_ORDER_ACTION_LABEL.archive).toBe("보관"); // 「삭제」 아님
    expect(ADMIN_ONLY_ORDER_ACTIONS).toEqual(["refund_complete"]);
  });

  it("보관 가능 상태는 비결제 상태만이다", () => {
    for (const s of ["paid", "partially_refunded", "refunded"] as const) {
      expect(ARCHIVABLE_ORDER_STATUSES).not.toContain(s);
    }
    expect(ARCHIVABLE_ORDER_STATUSES).toHaveLength(6);
  });
});

describe("이력(order_status_logs) 표시명 — 보관 값은 status 가 아니다", () => {
  it("서버가 이력에 쓰는 보관 값과 라벨이 한 곳에 있다", () => {
    expect(ARCHIVE_LOG_STATUS.archive).toBe("archived");
    expect(ARCHIVE_LOG_STATUS.unarchive).toBe("unarchived");
    for (const v of Object.values(ARCHIVE_LOG_STATUS)) {
      expect(ARCHIVE_LOG_STATUS_LABEL[v].length).toBeGreaterThan(0);
      expect(orderStatusLogLabel(v)).toBe(ARCHIVE_LOG_STATUS_LABEL[v]);
    }
    // 보관 값은 orders.status 허용값과 겹치지 않는다 — 겹치면 이력 라벨이 두 뜻을 갖는다.
    for (const v of Object.values(ARCHIVE_LOG_STATUS)) {
      expect(ORDER_STATUSES).not.toContain(v);
    }
  });

  it("status 값이면 운영자 표시명, null 은 「—」, 모르는 값은 원시코드를 내보내지 않는다", () => {
    for (const s of ORDER_STATUSES) {
      expect(orderStatusLogLabel(s)).toBe(ADMIN_ORDER_STATUS_LABEL[s]);
    }
    expect(orderStatusLogLabel(null)).toBe("—");
    expect(orderStatusLogLabel("weird_new_status")).not.toContain("weird");
  });
});

describe("allowedAdminOrderActions — 10상태 × {무통장, 토스} × 보관 유무", () => {
  type Cell = { live: AdminOrderAction[]; archived: AdminOrderAction[] };
  // ★D1 규칙을 표로 고정한다. 값이 하나라도 바뀌면 여기서 잡힌다.
  //   보관 여부는 reopen_deposit·archive 에만 걸린다(보관은 숨김이지 잠금이 아니다).
  const TABLE: Record<OrderStatus, { bank: Cell; toss: Cell }> = {
    draft: {
      bank: { live: ["archive"], archived: ["unarchive"] },
      toss: { live: ["archive"], archived: ["unarchive"] },
    },
    attempted: {
      bank: { live: ["cancel", "archive"], archived: ["cancel", "unarchive"] },
      toss: { live: ["cancel", "archive"], archived: ["cancel", "unarchive"] },
    },
    pending_payment: {
      bank: { live: ["cancel", "archive"], archived: ["cancel", "unarchive"] },
      toss: { live: ["cancel", "archive"], archived: ["cancel", "unarchive"] },
    },
    pending_deposit: {
      bank: {
        live: ["confirm_deposit", "cancel"],
        archived: ["confirm_deposit", "cancel", "unarchive"],
      },
      toss: { live: ["cancel"], archived: ["cancel", "unarchive"] },
    },
    paid: {
      bank: {
        live: ["refund_complete"],
        archived: ["refund_complete", "unarchive"],
      },
      toss: {
        live: ["refund_complete"],
        archived: ["refund_complete", "unarchive"],
      },
    },
    partially_refunded: {
      bank: {
        live: ["refund_complete"],
        archived: ["refund_complete", "unarchive"],
      },
      toss: {
        live: ["refund_complete"],
        archived: ["refund_complete", "unarchive"],
      },
    },
    refunded: {
      bank: { live: [], archived: ["unarchive"] },
      toss: { live: [], archived: ["unarchive"] },
    },
    cancelled: {
      bank: { live: ["reopen_deposit", "archive"], archived: ["unarchive"] },
      toss: { live: ["archive"], archived: ["unarchive"] },
    },
    failed: {
      bank: { live: ["archive"], archived: ["unarchive"] },
      toss: { live: ["archive"], archived: ["unarchive"] },
    },
    expired: {
      bank: { live: ["reopen_deposit", "archive"], archived: ["unarchive"] },
      toss: { live: ["archive"], archived: ["unarchive"] },
    },
  };

  const ARCHIVED_AT = "2026-09-17T03:00:00.000Z";

  for (const status of ORDER_STATUSES) {
    for (const method of ["bank", "toss"] as const) {
      const paymentMethod =
        method === "bank" ? BANK_TRANSFER_PAYMENT_METHOD : "toss";
      it(`${status} · ${method} · 미보관`, () => {
        expect(
          allowedAdminOrderActions({ status, paymentMethod, archivedAt: null }),
        ).toEqual(TABLE[status][method].live);
      });
      it(`${status} · ${method} · 보관됨`, () => {
        expect(
          allowedAdminOrderActions({
            status,
            paymentMethod,
            archivedAt: ARCHIVED_AT,
          }),
        ).toEqual(TABLE[status][method].archived);
      });
    }
  }

  it("★paid 계열은 어떤 조합에서도 취소·보관·재접수가 나오지 않는다", () => {
    for (const status of ["paid", "partially_refunded", "refunded"] as const) {
      for (const paymentMethod of [
        BANK_TRANSFER_PAYMENT_METHOD,
        "toss",
        null,
      ]) {
        for (const archivedAt of [null, ARCHIVED_AT]) {
          const allowed = allowedAdminOrderActions({
            status,
            paymentMethod,
            archivedAt,
          });
          expect(allowed).not.toContain("cancel");
          expect(allowed).not.toContain("archive");
          expect(allowed).not.toContain("reopen_deposit");
          expect(allowed).not.toContain("confirm_deposit");
        }
      }
    }
  });

  it("무통장이 아닌 수단(free·manual·null)은 토스와 같이 취급한다 — 입금 확인·재접수 없음", () => {
    for (const paymentMethod of ["free", "manual", null]) {
      expect(
        allowedAdminOrderActions({
          status: "pending_deposit",
          paymentMethod,
          archivedAt: null,
        }),
      ).toEqual(["cancel"]);
      expect(
        allowedAdminOrderActions({
          status: "cancelled",
          paymentMethod,
          archivedAt: null,
        }),
      ).toEqual(["archive"]);
    }
  });

  it("모르는 상태값은 보관 해제만(보관됐을 때) 열린다", () => {
    expect(
      allowedAdminOrderActions({
        status: "weird",
        paymentMethod: "toss",
        archivedAt: null,
      }),
    ).toEqual([]);
    expect(
      allowedAdminOrderActions({
        status: "weird",
        paymentMethod: "toss",
        archivedAt: ARCHIVED_AT,
      }),
    ).toEqual(["unarchive"]);
  });

  it("결과 순서는 ADMIN_ORDER_ACTIONS 순서를 따른다(option 순서 고정)", () => {
    const allowed = allowedAdminOrderActions({
      status: "pending_deposit",
      paymentMethod: BANK_TRANSFER_PAYMENT_METHOD,
      archivedAt: ARCHIVED_AT,
    });
    const idx = allowed.map((a) => ADMIN_ORDER_ACTIONS.indexOf(a));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});
