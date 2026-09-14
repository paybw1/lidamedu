// 결제 시트 — 「결제 버튼을 누른 직후, 돈이 움직이기 전」의 한 화면 (feat-11-012 P5-d·P5-e).
//
// ★왜 공용 부품인가: 종이책을 사는 길이 둘이다 — 장바구니 결제와 도서 상세의 **바로구매**.
//   배송지 입력을 장바구니 화면에만 놓으면 바로구매가 주소 없이 빠져나가고, 바로구매를
//   장바구니로 우회시키면 「바로」가 아니게 된다. 두 길이 공통으로 부르는 함수
//   (startCartCheckout) 앞에 이 시트를 세우면 길이 몇 개든 새는 곳이 없다.
//
// ★여기의 검사는 **친절함**이고 권위가 아니다. 유효성의 관문은 서버 액션의 zod 다
//   (create-cart-order). 시트를 건너뛰고 액션을 두드려도 같은 규칙에 걸린다.
// ★무통장은 계좌가 설정돼 있을 때만 내민다. 계좌 없이 「무통장」을 보여주면 학생이
//   입금할 곳 없는 안내를 받는다 — 반쪽 열림 금지(Layer 2 §6).

import { useEffect, useState } from "react";

import {
  BanknoteIcon,
  CreditCardIcon,
  LoaderCircleIcon,
  TruckIcon,
} from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/core/components/ui/sheet";
import { won } from "~/core/lib/format";
import { cn } from "~/core/lib/utils";
import type { CartItem } from "~/features/lms/lib/cart";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import {
  EMPTY_SHIPPING_ADDRESS,
  type ShippingAddress,
  shippingAddressSchema,
} from "~/features/orders/lib/shipping-address";

interface BankAccount {
  bank: string;
  number: string;
  holder: string;
}

/** /api/lecture/cart/quote 응답 중 이 시트가 쓰는 부분. */
type Quote =
  | {
      ok: true;
      needsShipping: boolean;
      shippingDefaults: { name: string; phone: string; address1: string } | null;
      bankAccount: BankAccount | null;
      subtotalKrw: number;
      shippingFeeKrw: number;
      couponDiscountKrw: number;
      payableKrw: number;
    }
  | { ok: false; error: string };

export interface CheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CartItem[];
  tossClientKey: string | null;
  /** 결제 실패 시 돌아올 경로. */
  failPath: string;
  /** 적용된 쿠폰 코드(장바구니에서만 쓴다). */
  couponCode?: string;
}

export function CheckoutSheet({
  open,
  onOpenChange,
  items,
  tossClientKey,
  failPath,
  couponCode,
}: CheckoutSheetProps) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState<"toss" | "bank_transfer">("toss");
  const [addr, setAddr] = useState<ShippingAddress>(EMPTY_SHIPPING_ADDRESS);
  const [depositor, setDepositor] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const itemsJson = JSON.stringify(items);

  // 시트를 열 때 견적을 받는다 — 금액·배송 필요 여부·기본 배송지·계좌가 한 왕복에 온다.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setQuote(null);
    setErrors({});
    const fd = new FormData();
    fd.append("items", itemsJson);
    if (couponCode) fd.append("code", couponCode);
    fetch("/api/lecture/cart/quote", { method: "POST", body: fd })
      .then((r) => r.json() as Promise<Quote>)
      .then((j) => {
        if (!alive) return;
        setQuote(j);
        // ★기본값은 **받은 그 순간에만** 채운다. 매 렌더마다 덮으면 학생이 고친 주소가
        //   되돌아간다.
        if (j.ok && j.shippingDefaults) {
          const d = j.shippingDefaults;
          setAddr((prev) =>
            prev.name || prev.address1
              ? prev
              : {
                  ...EMPTY_SHIPPING_ADDRESS,
                  name: d.name,
                  phone: d.phone,
                  address1: d.address1,
                },
          );
          setDepositor((cur) => cur || d.name);
        }
      })
      .catch(() => {
        if (alive) {
          setQuote({
            ok: false,
            error: "금액을 불러오지 못했습니다. 다시 시도해 주세요.",
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [open, itemsJson, couponCode]);

  const q = quote?.ok ? quote : null;
  const bank = q?.bankAccount ?? null;
  // 계좌가 없으면 카드만. 학생에게 고를 수 없는 선택지를 보이지 않는다.
  const canBank = Boolean(bank);
  const effectiveMethod = canBank ? method : "toss";

  const set = (k: keyof ShippingAddress) => (v: string) =>
    setAddr((a) => ({ ...a, [k]: v }));

  const submit = async () => {
    if (!q || !tossClientKey) return;
    const next: Record<string, string> = {};
    let shipping: ShippingAddress | null = null;
    if (q.needsShipping) {
      const parsed = shippingAddressSchema.safeParse(addr);
      if (parsed.success) {
        shipping = parsed.data;
      } else {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? "");
          if (key && !next[key]) next[key] = issue.message;
        }
      }
    }
    if (effectiveMethod === "bank_transfer" && !depositor.trim()) {
      next.depositor = "입금자명을 입력해 주세요.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      await startCartCheckout(items, tossClientKey, failPath, {
        method: effectiveMethod,
        depositorName: depositor.trim() || undefined,
        shipping,
        couponCode,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>결제하기</SheetTitle>
          <SheetDescription>
            결제수단을 고르고, 실물 교재가 있으면 받으실 곳을 확인해 주세요.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {quote === null ? (
            <p className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" /> 금액을 확인하는 중…
            </p>
          ) : !q ? (
            <p className="py-8 text-sm text-red-600 dark:text-red-400">
              {quote.ok ? "" : quote.error}
            </p>
          ) : (
            <div className="space-y-6">
              {/* ── 결제수단 ─────────────────────────────────────────── */}
              <section>
                <h3 className="text-sm font-semibold">결제수단</h3>
                <div className="mt-2 grid gap-2">
                  <MethodButton
                    active={effectiveMethod === "toss"}
                    onClick={() => setMethod("toss")}
                    icon={<CreditCardIcon className="size-4" />}
                    label="카드 결제"
                    hint="결제 즉시 수강·배송이 시작됩니다."
                  />
                  {canBank ? (
                    <MethodButton
                      active={effectiveMethod === "bank_transfer"}
                      onClick={() => setMethod("bank_transfer")}
                      icon={<BanknoteIcon className="size-4" />}
                      label="무통장 입금"
                      hint="입금 확인 뒤 수강·배송이 시작됩니다."
                    />
                  ) : null}
                </div>
              </section>

              {effectiveMethod === "bank_transfer" && bank ? (
                <section className="bg-muted/50 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {bank.bank} {bank.number}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    예금주 {bank.holder}
                  </p>
                  <div className="mt-3">
                    <Label htmlFor="co-depositor" className="text-xs">
                      입금자명
                    </Label>
                    <Input
                      id="co-depositor"
                      value={depositor}
                      onChange={(e) => setDepositor(e.currentTarget.value)}
                      placeholder="입금하실 분 성함"
                      className="mt-1"
                    />
                    <FieldError message={errors.depositor} />
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      ★입금자명이 다르면 확인이 늦어집니다. 신청 후 72시간 안에 입금해
                      주세요.
                    </p>
                  </div>
                </section>
              ) : null}

              {/* ── 배송지 ───────────────────────────────────────────── */}
              {q.needsShipping ? (
                <section>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <TruckIcon className="size-4" /> 받으실 곳
                  </h3>
                  <div className="mt-2 grid gap-3">
                    <Field
                      id="co-name"
                      label="받는 사람"
                      value={addr.name}
                      onChange={set("name")}
                      error={errors.name}
                    />
                    <Field
                      id="co-phone"
                      label="연락처"
                      value={addr.phone}
                      onChange={set("phone")}
                      placeholder="010-0000-0000"
                      error={errors.phone}
                    />
                    <Field
                      id="co-postcode"
                      label="우편번호"
                      value={addr.postcode}
                      onChange={set("postcode")}
                      placeholder="12345"
                      inputMode="numeric"
                      error={errors.postcode}
                    />
                    <Field
                      id="co-address1"
                      label="주소"
                      value={addr.address1}
                      onChange={set("address1")}
                      error={errors.address1}
                    />
                    <Field
                      id="co-address2"
                      label="상세주소"
                      value={addr.address2}
                      onChange={set("address2")}
                      placeholder="동·호수"
                      error={errors.address2}
                    />
                    <Field
                      id="co-memo"
                      label="배송 요청사항"
                      value={addr.memo}
                      onChange={set("memo")}
                      placeholder="예: 부재 시 경비실"
                      error={errors.memo}
                    />
                  </div>
                </section>
              ) : null}

              {/* ── 금액 ─────────────────────────────────────────────── */}
              <section className="space-y-1.5 border-t pt-4 text-sm">
                <Row label="상품 금액" value={won(q.subtotalKrw)} />
                {q.shippingFeeKrw > 0 ? (
                  <Row label="배송비" value={won(q.shippingFeeKrw)} />
                ) : null}
                {q.couponDiscountKrw > 0 ? (
                  <Row label="쿠폰 할인" value={"- " + won(q.couponDiscountKrw)} />
                ) : null}
                <Row label="결제 금액" value={won(q.payableKrw)} strong />
              </section>
            </div>
          )}
        </div>

        <SheetFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={!q || busy || !tossClientKey}
            className="w-full"
          >
            {busy ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : effectiveMethod === "bank_transfer" ? (
              "입금 정보 받기"
            ) : (
              (q ? won(q.payableKrw) + " " : "") + "결제하기"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function MethodButton({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition-colors",
        active ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </span>
      <span className="text-muted-foreground mt-0.5 block text-xs">{hint}</span>
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "numeric";
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="mt-1"
      />
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>;
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={strong ? "text-base font-bold" : ""}>{value}</span>
    </div>
  );
}
