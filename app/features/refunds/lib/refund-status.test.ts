import { describe, expect, it } from "vitest";

import {
  REFUND_STATUSES,
  REFUND_STATUS_LABELS,
  REFUND_TRANSITIONS,
  type RefundStatus,
  type RefundTransitionContext,
  checkRefundTransition,
  hasCompletePgRecord,
  isTerminalRefundStatus,
  remainingRefundableKrw,
  resolveDoneStatus,
} from "./refund-status";

const PG_OK = {
  cancelKrw: 45_000,
  cancelledAt: "2026-09-14T05:00:00.000Z",
  transactionNo: "cancel_abc123",
  operatorId: "e20ac99a-0000-0000-0000-000000000000",
};

function ctx(over: Partial<RefundTransitionContext> = {}): RefundTransitionContext {
  return {
    originalPaidKrw: 45_000,
    priorRefundedKrw: 0,
    thisRefundKrw: 45_000,
    pg: PG_OK,
    actorIsAdmin: false,
    ...over,
  };
}

describe("환불 상태 12값", () => {
  it("상태·라벨·전이표가 서로 빠짐없이 맞는다", () => {
    expect(REFUND_STATUSES).toHaveLength(12);
    for (const s of REFUND_STATUSES) {
      expect(REFUND_STATUS_LABELS[s]).toBeTruthy();
      expect(REFUND_TRANSITIONS[s]).toBeDefined();
      // 전이표가 가리키는 곳은 모두 실재하는 상태여야 한다.
      for (const to of REFUND_TRANSITIONS[s]) {
        expect(REFUND_STATUSES).toContain(to);
        expect(to).not.toBe(s);
      }
    }
  });

  it("종결 4값과 복구 가능한 처리오류를 구분한다", () => {
    expect(isTerminalRefundStatus("partial_done")).toBe(true);
    expect(isTerminalRefundStatus("full_done")).toBe(true);
    expect(isTerminalRefundStatus("rejected")).toBe(true);
    expect(isTerminalRefundStatus("withdrawn")).toBe(true);
    // ★처리오류는 종결이 아니다 — 깨진 후속처리를 다시 집어야 한다.
    expect(isTerminalRefundStatus("error")).toBe(false);
    expect(REFUND_TRANSITIONS.error.length).toBeGreaterThan(0);
  });

  it("모든 상태에서 처리오류·검토중으로 이어지는 길이 있다 (막다른 골목 없음)", () => {
    const reachable = (from: RefundStatus) => {
      const seen = new Set<RefundStatus>([from]);
      const queue: RefundStatus[] = [from];
      while (queue.length) {
        for (const to of REFUND_TRANSITIONS[queue.shift()!]) {
          if (!seen.has(to)) {
            seen.add(to);
            queue.push(to);
          }
        }
      }
      return seen;
    };
    for (const s of REFUND_STATUSES) {
      expect(reachable(s).has("reviewing")).toBe(true);
    }
  });
});

describe("전이 가드 — 요청서 §4 처리순서", () => {
  it("주 경로가 끝까지 열려 있다", () => {
    const path: RefundStatus[] = [
      "received",
      "reviewing",
      "amount_fixed",
      "pg_pending",
      "pg_done",
      "full_done",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(checkRefundTransition(path[i], path[i + 1], ctx())).toEqual({ ok: true });
    }
  });

  it("표에 없는 칸은 거부하고, 왜 안 되는지 말한다", () => {
    const r = checkRefundTransition("received", "full_done", ctx());
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("환불접수에서 전체환불완료");
  });

  it("★PG 취소완료에서는 앞으로 되돌아갈 수 없다 — 돈이 이미 나갔다", () => {
    expect(REFUND_TRANSITIONS.pg_done).not.toContain("amount_fixed");
    expect(REFUND_TRANSITIONS.pg_done).not.toContain("pg_pending");
    expect(checkRefundTransition("pg_done", "amount_fixed", ctx()).ok).toBe(false);
  });

  it("같은 상태로는 바꿀 수 없다", () => {
    expect(checkRefundTransition("reviewing", "reviewing", ctx()).ok).toBe(false);
  });
});

describe("금액 가드 — 요청서 §10", () => {
  it("환불금액이 확정되지 않으면 PG 취소대기로 못 간다", () => {
    const r = checkRefundTransition("amount_fixed", "pg_pending", ctx({ thisRefundKrw: null }));
    expect(r.ok === false && r.error).toContain("환불금액을 먼저 확정");
  });

  it("★최초 결제금액을 초과하는 누적 환불을 막고, 남은 가능금액을 알려준다", () => {
    const r = checkRefundTransition(
      "amount_fixed",
      "pg_pending",
      ctx({ priorRefundedKrw: 30_000, thisRefundKrw: 20_000 }),
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("15,000원");
  });

  it("누적이 정확히 결제금액이면 통과한다 (경계)", () => {
    expect(
      checkRefundTransition(
        "amount_fixed",
        "pg_pending",
        ctx({ priorRefundedKrw: 30_000, thisRefundKrw: 15_000 }),
      ),
    ).toEqual({ ok: true });
  });

  it("0원·음수 환불은 다음 단계로 못 간다", () => {
    expect(checkRefundTransition("amount_fixed", "pg_pending", ctx({ thisRefundKrw: 0 })).ok).toBe(false);
    expect(checkRefundTransition("amount_fixed", "pg_pending", ctx({ thisRefundKrw: -1 })).ok).toBe(false);
  });
});

describe("토스 취소결과 가드 — 요청서 §6", () => {
  it("4값이 다 차야 완료로 간다", () => {
    expect(hasCompletePgRecord(PG_OK)).toBe(true);
    expect(hasCompletePgRecord(null)).toBe(false);
    expect(hasCompletePgRecord({ ...PG_OK, transactionNo: "   " })).toBe(false);
    expect(hasCompletePgRecord({ ...PG_OK, cancelledAt: null })).toBe(false);
    expect(hasCompletePgRecord({ ...PG_OK, operatorId: null })).toBe(false);
    expect(hasCompletePgRecord({ ...PG_OK, cancelKrw: 0 })).toBe(false);
  });

  it("취소정보가 비면 환불완료 처리가 막힌다", () => {
    const r = checkRefundTransition("pg_done", "full_done", ctx({ pg: null }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toContain("토스 취소금액");
  });
});

describe("전체/부분은 고르는 값이 아니라 금액에서 나온다", () => {
  it("전액이면 전체환불완료만 허용된다", () => {
    expect(checkRefundTransition("pg_done", "full_done", ctx())).toEqual({ ok: true });
    const r = checkRefundTransition("pg_done", "partial_done", ctx());
    expect(r.ok === false && r.error).toContain("전체환불완료로 처리");
  });

  it("일부면 부분환불완료만 허용된다", () => {
    const partial = ctx({ thisRefundKrw: 20_000, pg: { ...PG_OK, cancelKrw: 20_000 } });
    expect(checkRefundTransition("pg_done", "partial_done", partial)).toEqual({ ok: true });
    expect(checkRefundTransition("pg_done", "full_done", partial).ok).toBe(false);
  });

  it("resolveDoneStatus 가 목적지를 정한다", () => {
    expect(resolveDoneStatus({ originalPaidKrw: 45_000, priorRefundedKrw: 0, thisRefundKrw: 45_000 })).toBe("full_done");
    expect(resolveDoneStatus({ originalPaidKrw: 45_000, priorRefundedKrw: 30_000, thisRefundKrw: 15_000 })).toBe("full_done");
    expect(resolveDoneStatus({ originalPaidKrw: 45_000, priorRefundedKrw: 0, thisRefundKrw: 20_000 })).toBe("partial_done");
    // 초과는 목적지가 없다.
    expect(resolveDoneStatus({ originalPaidKrw: 45_000, priorRefundedKrw: 40_000, thisRefundKrw: 10_000 })).toBeNull();
    expect(resolveDoneStatus({ originalPaidKrw: null, priorRefundedKrw: 0, thisRefundKrw: 1 })).toBeNull();
  });

  it("★배송비를 확정액에 포함해야 full_done 에 닿는다 (P7-핸드오프 ①)", () => {
    // 주문 13,000 = 상품 10,000 + 배송비 3,000. original_paid_krw 는 배송비를 포함한다.
    // 상품만 환불하면(종전) 배송비만큼 잔여가 남아 full_done 에 영영 닿지 못했다 —
    // refund_items 는 order_items 만 가리켜 배송비를 담을 행이 없었기 때문이다.
    expect(
      resolveDoneStatus({ originalPaidKrw: 13_000, priorRefundedKrw: 0, thisRefundKrw: 10_000 }),
    ).toBe("partial_done");
    // refunds.shipping_refund_krw 를 더한 확정액이라야 전액이 된다.
    expect(
      resolveDoneStatus({ originalPaidKrw: 13_000, priorRefundedKrw: 0, thisRefundKrw: 13_000 }),
    ).toBe("full_done");
  });
});

describe("★PG 취소 후 반려·철회 차단", () => {
  it("돈이 나간 뒤에는 어느 상태에서도 반려·철회로 닫히지 않는다", () => {
    const afterPg = ctx({ pg: { ...PG_OK, cancelKrw: 45_000 } });
    for (const from of REFUND_STATUSES) {
      if (from === "rejected" || from === "withdrawn") continue;
      expect(checkRefundTransition(from, "rejected", afterPg).ok).toBe(false);
      expect(checkRefundTransition(from, "withdrawn", afterPg).ok).toBe(false);
    }
  });

  it("전이표가 허용하는 자리에서는 **PG 취소 때문에** 막혔다고 말한다", () => {
    const afterPg = ctx({ pg: { ...PG_OK, cancelKrw: 45_000 } });
    // reviewing·amount_fixed·error 에서는 표가 반려·철회를 허용한다 — 그래서 새 가드가 잡는다.
    for (const from of ["reviewing", "amount_fixed", "error"] as const) {
      const r = checkRefundTransition(from, "rejected", afterPg);
      expect(r.ok === false && r.error).toContain("PG 취소가 이루어진");
    }
  });

  it("PG 취소 전에는 반려·철회가 열려 있다", () => {
    const beforePg = ctx({ pg: null });
    expect(checkRefundTransition("reviewing", "rejected", beforePg)).toEqual({ ok: true });
    expect(checkRefundTransition("received", "withdrawn", beforePg)).toEqual({ ok: true });
  });
});

describe("종결 되돌리기 — 요청서 §10", () => {
  it("★돈이 나간 건은 원장 권한과 사유가 있어야 되돌릴 수 있다", () => {
    const plain = checkRefundTransition("full_done", "reviewing", ctx());
    expect(plain.ok === false && plain.error).toContain("원장만");

    const noReason = checkRefundTransition("full_done", "reviewing", ctx({ actorIsAdmin: true }));
    expect(noReason.ok === false && noReason.error).toContain("수정사유");

    expect(
      checkRefundTransition("full_done", "reviewing", ctx({ actorIsAdmin: true, editReason: "오처리 정정" })),
    ).toEqual({ ok: true });
  });

  it("반려·철회는 돈이 움직이지 않았으므로 담당자가 되돌린다", () => {
    expect(checkRefundTransition("rejected", "reviewing", ctx())).toEqual({ ok: true });
    expect(checkRefundTransition("withdrawn", "reviewing", ctx())).toEqual({ ok: true });
  });
});

describe("남은 환불 가능금액", () => {
  it("결제금액 − 누적 환불액, 음수로 내려가지 않는다", () => {
    expect(remainingRefundableKrw({ originalPaidKrw: 45_000, priorRefundedKrw: 15_000 })).toBe(30_000);
    expect(remainingRefundableKrw({ originalPaidKrw: 45_000, priorRefundedKrw: 50_000 })).toBe(0);
    expect(remainingRefundableKrw({ originalPaidKrw: null, priorRefundedKrw: null })).toBe(0);
  });
});
