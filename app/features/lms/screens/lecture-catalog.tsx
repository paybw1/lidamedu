// 강의 카탈로그(강의 플랫폼) — course/T-PASS 판매 상품 목록 + 수강신청/구매 (feat-11 S2).
// 구매는 단건 결제: /api/payments/create-order(1-item 주문 경유) → 토스 requestPayment.
// 결제 성공 시 confirm 이 주문 fulfill → enrollments 지급(M4).
import { CheckIcon, GraduationCapIcon, TicketIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import { Card, CardContent } from "~/core/components/ui/card";
import makeServerClient from "~/core/lib/supa-client.server";
import { cn } from "~/core/lib/utils";
import { useCart } from "~/features/lms/lib/cart";
import {
  LECTURE_CATEGORIES,
  LECTURE_CATEGORY_LABEL,
  type LectureCategory,
} from "~/features/lms/lib/lecture-category";
import { PRODUCT_KIND_LABEL } from "~/features/subscriptions/labels";
import {
  cancelPendingCheckout,
  isTossUserCancel,
} from "~/features/subscriptions/lib/cancel-pending-checkout.client";
import {
  type LectureProduct,
  listSellableLectureProducts,
} from "~/features/lms/queries.server";

import type { Route } from "./+types/lecture-catalog";

export function meta() {
  return [{ title: "수강신청 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const products = await listSellableLectureProducts(client, user?.id ?? null);
  return {
    products,
    isAuthed: Boolean(user),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
  };
}

// 단건 결제 개시 — pending payment 생성(서버 권위 금액) 후 토스 SDK 호출.
async function startLectureCheckout(
  product: LectureProduct,
  tossClientKey: string,
): Promise<void> {
  const fd = new FormData();
  fd.append("intent", "create-order");
  fd.append("planCode", product.code);
  const res = await fetch("/api/payments/create-order", {
    method: "POST",
    body: fd,
  });
  const json = (await res.json()) as {
    ok?: boolean;
    orderId?: string;
    amount?: number;
    error?: string;
  };
  if (!json.ok || !json.orderId) {
    alert(`결제 준비에 실패했습니다: ${json.error ?? "알 수 없는 오류"}`);
    return;
  }
  const amount = typeof json.amount === "number" ? json.amount : product.priceKrw;
  try {
    const { loadTossPayments } = await import("@tosspayments/tosspayments-sdk");
    const tossPayments = await loadTossPayments(tossClientKey);
    const payment = tossPayments.payment({ customerKey: product.planId });
    await payment.requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: amount },
      orderId: json.orderId,
      orderName: product.name,
      successUrl: `${window.location.origin}/api/payments/toss/confirm`,
      failUrl: `${window.location.origin}/lecture/catalog?failed=1`,
    });
  } catch (e) {
    // 결제창 취소·오류 — 남은 pending 결제 정리 후 취소는 조용히.
    cancelPendingCheckout(json.orderId);
    if (!isTossUserCancel(e)) {
      alert(
        `결제 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

export default function LectureCatalog({ loaderData }: Route.ComponentProps) {
  const { products, isAuthed, tossClientKey } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const catParam = searchParams.get("cat");
  const activeCat: LectureCategory | null =
    catParam && (LECTURE_CATEGORIES as readonly string[]).includes(catParam)
      ? (catParam as LectureCategory)
      : null;

  const counts = LECTURE_CATEGORIES.reduce(
    (acc, c) => {
      acc[c] = products.filter((p) => p.category === c).length;
      return acc;
    },
    {} as Record<LectureCategory, number>,
  );
  const filtered = activeCat
    ? products.filter((p) => p.category === activeCat)
    : products;

  const setCat = (c: LectureCategory | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (c) next.set("cat", c);
        else next.delete("cat");
        return next;
      },
      { preventScrollReset: true },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight">수강신청</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        영상 강의와 기간권(T-PASS)을 수강신청·구매합니다.
      </p>

      {/* 카테고리 탭 — 전체 / 1차 / 2차 / 패키지 / 현장 */}
      <div className="mt-6 flex flex-wrap gap-1.5">
        <CatTab
          label="전체"
          count={products.length}
          active={activeCat === null}
          onClick={() => setCat(null)}
        />
        {LECTURE_CATEGORIES.map((c) => (
          <CatTab
            key={c}
            label={LECTURE_CATEGORY_LABEL[c]}
            count={counts[c]}
            active={activeCat === c}
            onClick={() => setCat(c)}
          />
        ))}
      </div>

      {products.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <GraduationCapIcon className="text-muted-foreground/50 size-10" />
          <p className="mt-4 text-sm font-medium">판매 중인 강의 상품이 없습니다</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            강의가 오픈되면 이곳에서 수강신청할 수 있습니다.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="mt-8 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <GraduationCapIcon className="text-muted-foreground/50 size-10" />
          <p className="mt-4 text-sm font-medium">
            이 분류의 강의가 아직 없습니다
          </p>
          <button
            type="button"
            onClick={() => setCat(null)}
            className="text-link mt-2 text-sm font-semibold hover:underline"
          >
            전체 보기 →
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <ProductCard
              key={p.planId}
              product={p}
              isAuthed={isAuthed}
              tossClientKey={tossClientKey}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 카테고리 탭 — 세그먼트 pill(수 뱃지 포함).
function CatTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[11px] tabular-nums",
          active ? "bg-primary-foreground/20" : "bg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function ProductCard({
  product,
  isAuthed,
  tossClientKey,
}: {
  product: LectureProduct;
  isAuthed: boolean;
  tossClientKey: string | null;
}) {
  const isTpass = product.productKind === "tpass";
  const { addPlan, addBook, has } = useCart();
  const inCart = has(`plan:${product.code}`);
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <Link
          to={`/lecture/catalog/${product.code}`}
          className="group flex flex-1 flex-col gap-3"
        >
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 text-[11px]">
            {isTpass ? (
              <TicketIcon className="size-3" />
            ) : (
              <GraduationCapIcon className="size-3" />
            )}
            {PRODUCT_KIND_LABEL[product.productKind]}
          </Badge>
          {product.category ? (
            <Badge variant="outline" className="text-[11px]">
              {LECTURE_CATEGORY_LABEL[product.category]}
            </Badge>
          ) : null}
          {product.durationDays > 0 ? (
            <span className="text-muted-foreground text-[11px]">
              {product.durationDays}일 수강
            </span>
          ) : null}
        </div>

        <h2 className="text-base leading-snug font-semibold text-balance group-hover:underline">
          {product.name}
        </h2>
        {product.description ? (
          <p className="text-muted-foreground line-clamp-3 text-sm">
            {product.description}
          </p>
        ) : null}

        {product.courses.length > 0 ? (
          <ul className="text-muted-foreground mt-auto space-y-0.5 text-xs">
            {product.courses.slice(0, 4).map((c) => (
              <li key={c.courseId} className="truncate">
                · {c.title}
              </li>
            ))}
            {product.courses.length > 4 ? (
              <li>· 외 {product.courses.length - 4}개 강의</li>
            ) : null}
          </ul>
        ) : (
          <div className="mt-auto" />
        )}
        </Link>

        {product.books.length > 0 ? (
          <div className="border-t pt-2.5">
            <p className="text-muted-foreground mb-1 text-[11px] font-semibold">
              교재
            </p>
            <ul className="space-y-1">
              {product.books.map((b) => {
                const inBookCart = has(`book:${b.bookId}`);
                return (
                  <li
                    key={b.bookId}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">{b.title}</span>
                    <span className="tabular-nums shrink-0">
                      {b.priceKrw.toLocaleString("ko-KR")}원
                    </span>
                    {isAuthed ? (
                      inBookCart ? (
                        <Link
                          to="/lecture/cart"
                          className="text-link shrink-0 text-[11px] font-semibold hover:underline"
                        >
                          담김
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addBook(b.bookId, 1)}
                          className="border-border hover:bg-muted/50 shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium"
                        >
                          담기
                        </button>
                      )
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="mt-2 flex items-center justify-between border-t pt-3">
          <span className="text-lg font-bold tabular-nums">
            {product.priceKrw.toLocaleString("ko-KR")}
            <span className="text-muted-foreground ml-0.5 text-xs font-normal">
              원
            </span>
          </span>
          {product.owned ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/lecture">수강 중</Link>
            </Button>
          ) : !isAuthed ? (
            <Button asChild size="sm">
              <Link to="/login">로그인 후 구매</Link>
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              {inCart ? (
                <Button asChild size="sm" variant="outline">
                  <Link to="/lecture/cart">
                    <CheckIcon className="size-3.5" /> 담김
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addPlan(product.code)}
                >
                  담기
                </Button>
              )}
              <Button
                size="sm"
                disabled={!tossClientKey}
                onClick={() =>
                  tossClientKey
                    ? startLectureCheckout(product, tossClientKey)
                    : undefined
                }
              >
                바로 구매
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
