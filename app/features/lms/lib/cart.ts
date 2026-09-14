// 강의 플랫폼 장바구니 — localStorage 클라이언트 상태(결제 전 임시 = interaction 상태).
// 강의(plan: code)·도서(book: id+수량) 혼합. 결제 시 /api/payments/create-cart-order 로
// 항목을 넘기면 서버가 가격을 재검증(클라 가격 불신)해 주문·결제를 만든다.
import { useCallback, useEffect, useState } from "react";

export type CartItem =
  | { kind: "plan"; code: string }
  | { kind: "book"; bookId: string; quantity: number }
  | { kind: "bundle"; bundleId: string };

const KEY = "lidam_cart_v1";
const EVENT = "lidam-cart-change";
// 결제를 시작한 항목의 키 — 복귀 시 **그 항목만** 지우기 위한 표식.
const PENDING_KEY = "lidam_cart_pending_v1";

export function cartItemKey(it: CartItem): string {
  if (it.kind === "plan") return `plan:${it.code}`;
  if (it.kind === "bundle") return `bundle:${it.bundleId}`;
  return `book:${it.bookId}`;
}

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      // ★"bundle" 이 빠져 있었다(feat-11-012 P5). 그 한 낱말 때문에 addBundle 이 쓴 세트를
      //   다음 read 가 버려 ①「세트 담기」를 눌러도 장바구니에 안 들어가고 ②버튼이 「담김」으로
      //   바뀌지 않고 ③헤더 숫자가 오르지 않았다. 더 나쁜 건, write() 가 그 걸러진 배열을
      //   저장하므로 **세트를 담아둔 채 다른 책을 담으면 저장돼 있던 세트까지 지워졌다.**
      (x): x is CartItem =>
        !!x &&
        typeof x === "object" &&
        ((x as CartItem).kind === "plan" ||
          (x as CartItem).kind === "book" ||
          (x as CartItem).kind === "bundle"),
    );
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  // 같은 탭 내 다른 구독자에게 알림(storage 이벤트는 다른 탭에서만 발생).
  window.dispatchEvent(new Event(EVENT));
}

/**
 * 결제를 시작한 항목을 표시해 둔다(장바구니 결제·바로구매 공용).
 *
 * ★서버는 둘을 구분하지 못한다 — 바로구매도 1건짜리 **카트 주문**으로 만들어지기 때문이다
 *   (feat-11-004 4a "이중 경로 금지"). 그래서 "무엇을 결제했는가"는 결제를 **시작한 쪽**만
 *   안다. 종전에는 성공 복귀가 장바구니를 통째로 비워, 강의 셋을 담아둔 채 책 한 권을
 *   바로 사면 담아둔 셋이 사라졌다.
 */
export function markCheckoutPending(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(items.map(cartItemKey)),
    );
  } catch {
    /* 저장 못 해도 결제는 진행한다 — 비우기만 건너뛴다 */
  }
}

/**
 * 결제 성공 복귀 — 결제한 항목만 장바구니에서 지운다. 지운 개수를 돌려준다.
 * ★표식이 없으면(다른 탭에서 결제 등) **아무것도 지우지 않는다** — 통째로 비우는 것보다 안전하다.
 */
export function clearPurchasedItems(): number {
  if (typeof window === "undefined") return 0;
  let keys: string[] = [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    window.localStorage.removeItem(PENDING_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      keys = parsed.filter((k): k is string => typeof k === "string");
    }
  } catch {
    return 0;
  }
  if (keys.length === 0) return 0;
  const cur = read();
  const next = cur.filter((it) => !keys.includes(cartItemKey(it)));
  if (next.length !== cur.length) write(next);
  return cur.length - next.length;
}

/** 장바구니 훅 — 항목·개수 + 변경 함수. localStorage + 커스텀 이벤트로 컴포넌트 간 동기화. */
export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const addPlan = useCallback((code: string) => {
    const cur = read();
    if (cur.some((it) => it.kind === "plan" && it.code === code)) return;
    write([...cur, { kind: "plan", code }]);
  }, []);

  const addBook = useCallback((bookId: string, quantity = 1) => {
    const cur = read();
    const idx = cur.findIndex((it) => it.kind === "book" && it.bookId === bookId);
    if (idx >= 0) {
      const next = [...cur];
      const item = next[idx];
      if (item.kind === "book")
        next[idx] = { ...item, quantity: item.quantity + quantity };
      write(next);
    } else {
      write([...cur, { kind: "book", bookId, quantity }]);
    }
  }, []);

  const addBundle = useCallback((bundleId: string) => {
    const cur = read();
    if (cur.some((it) => it.kind === "bundle" && it.bundleId === bundleId))
      return;
    write([...cur, { kind: "bundle", bundleId }]);
  }, []);

  const setBookQty = useCallback((bookId: string, quantity: number) => {
    const cur = read();
    write(
      cur.map((it) =>
        it.kind === "book" && it.bookId === bookId
          ? { ...it, quantity: Math.max(1, quantity) }
          : it,
      ),
    );
  }, []);

  const remove = useCallback((key: string) => {
    write(read().filter((it) => cartItemKey(it) !== key));
  }, []);

  const clear = useCallback(() => write([]), []);

  const has = useCallback(
    (key: string) => items.some((it) => cartItemKey(it) === key),
    [items],
  );

  const count = items.reduce(
    (n, it) => n + (it.kind === "book" ? it.quantity : 1),
    0,
  );

  return {
    items,
    count,
    addPlan,
    addBook,
    addBundle,
    setBookQty,
    remove,
    clear,
    has,
  };
}
