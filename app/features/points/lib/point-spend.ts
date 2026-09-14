// 포인트 결제 규칙 — 견적·결제·화면이 **같은 식**을 쓰게 하는 단일 출처 (feat-11-013 D15).
//
// ★이 파일이 존재하는 이유: 상한 계산을 cart-quote 와 create-cart-order 에 각각 적으면
//   「화면엔 되는데 결제는 거절」이 난다. cart-quote 가 resolveCartItems 를 공유하는 것과
//   같은 이유다. 화면도 이 함수를 부른다.
//
// ★★서버 전용 코드를 import 하지 않는다 — 화면(checkout-sheet)이 부르므로
//   points.server.ts 를 끌어오면 typecheck 는 통과하고 **build 가 깨진다**
//   (메모 build-server-in-client). 여기는 순수 계산만 한다.
//
// 규칙(원장 승인 2026-09-14, 설계문서 D15-a):
//   1P = 1원 · 100P 단위 · 보유 1,000P 이상일 때만 · 상한 = 결제금액 − 1,000원

/** 사용 단위(P). 1P 단위는 잔돈이 남아 배분·환불 반환이 지저분해진다. */
export const POINT_UNIT = 100;

/** 이 미만을 보유하면 포인트 결제를 쓸 수 없다. 가입 5,000P 를 받으면 바로 쓸 수 있는 수준. */
export const MIN_BALANCE_TO_USE = 1_000;

/**
 * PG 로 반드시 남겨야 하는 최소 결제액(원).
 *
 * ★★이 값이 「전액 포인트 결제 불가」의 실체다. 정책 취향이 아니라 **경로가 없어서**다 —
 *   결제금액이 0원이면 토스 주문이 성립하지 않고, 무료 지급 경로는 feat-11-012 에서
 *   별도 과제로 남겨 뒀다. 그 경로가 생기면 **이 상수만 0 으로 내리면** 전액 결제가 열린다.
 */
export const MIN_PG_CHARGE_KRW = 1_000;

/** 내림으로 단위 맞추기. 상한을 넘지 않게 항상 내린다. */
function floorToUnit(krw: number): number {
  return Math.floor(krw / POINT_UNIT) * POINT_UNIT;
}

/**
 * 이 주문에서 쓸 수 있는 포인트의 최대치(원).
 *
 * @param balance   보유 포인트
 * @param payableKrw 포인트를 빼기 **전**의 결제 예정액(쿠폰·배송비까지 반영된 값)
 */
export function maxUsablePoints(input: { balance: number; payableKrw: number }): number {
  const balance = Math.max(0, Math.floor(input.balance));
  if (balance < MIN_BALANCE_TO_USE) return 0;
  const headroom = input.payableKrw - MIN_PG_CHARGE_KRW;
  if (headroom < POINT_UNIT) return 0;
  return floorToUnit(Math.min(balance, headroom));
}

export type PointUseCheck =
  | { ok: true; amountKrw: number }
  | { ok: false; error: string; maxKrw: number };

/**
 * 학생이 입력한 사용액을 검증한다.
 *
 * ★조용히 깎지 않는다. 상한을 넘으면 **거절하고 이유를 말한다** — 말없이 줄이면
 *   학생이 본 금액과 청구액이 달라지고, 그건 돈 문제로 번진다.
 * ★서버가 권위다. 화면도 같은 함수를 부르지만 그건 친절함이고, 최종 판정은 서버와
 *   그 뒤의 RPC(잔액은 잠금 안에서 다시 센다)가 한다.
 */
export function checkPointUse(input: {
  requestedKrw: number;
  balance: number;
  payableKrw: number;
}): PointUseCheck {
  const maxKrw = maxUsablePoints({ balance: input.balance, payableKrw: input.payableKrw });
  const requested = Math.floor(input.requestedKrw);

  if (!Number.isFinite(requested) || requested < 0) {
    return { ok: false, error: "사용할 포인트를 확인해 주세요.", maxKrw };
  }
  if (requested === 0) return { ok: true, amountKrw: 0 };

  if (input.balance < MIN_BALANCE_TO_USE) {
    return {
      ok: false,
      error: `포인트는 ${MIN_BALANCE_TO_USE.toLocaleString("ko-KR")}P 이상 모았을 때부터 쓸 수 있습니다.`,
      maxKrw,
    };
  }
  if (requested % POINT_UNIT !== 0) {
    return { ok: false, error: `포인트는 ${POINT_UNIT}P 단위로 쓸 수 있습니다.`, maxKrw };
  }
  if (requested > input.balance) {
    return { ok: false, error: "보유 포인트가 부족합니다.", maxKrw };
  }
  if (maxKrw <= 0) {
    return {
      ok: false,
      error: `이 주문에는 포인트를 쓸 수 없습니다. 결제 금액이 ${MIN_PG_CHARGE_KRW.toLocaleString("ko-KR")}원보다 커야 합니다.`,
      maxKrw,
    };
  }
  if (requested > maxKrw) {
    return {
      ok: false,
      // ★왜 막혔는지 말한다 — 「최대 N원」만 말하면 학생은 잔액이 모자란 줄 안다.
      error: `이 주문에는 최대 ${maxKrw.toLocaleString("ko-KR")}P 까지 쓸 수 있습니다. 카드로 최소 ${MIN_PG_CHARGE_KRW.toLocaleString("ko-KR")}원은 결제되어야 합니다.`,
      maxKrw,
    };
  }
  return { ok: true, amountKrw: requested };
}
