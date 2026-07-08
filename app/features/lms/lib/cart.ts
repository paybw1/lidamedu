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
      (x): x is CartItem =>
        !!x &&
        typeof x === "object" &&
        ((x as CartItem).kind === "plan" || (x as CartItem).kind === "book"),
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
