// 수강신청 상세(강의 플랫폼) — /lecture/catalog/:productCode.
//   카탈로그 카드 클릭 → 이 화면. 본문 = 운영자 입력 이미지 또는 HTML(히어로 배너와 동일 방식),
//   없으면 소개·포함 강의·교재 기본 정보로 폴백. 하단 sticky 담기/수강신청.
import {
  ArrowLeftIcon,
  CheckIcon,
  GraduationCapIcon,
  ShoppingCartIcon,
  TicketIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { startCartCheckout } from "~/features/lms/lib/cart-checkout";
import { useCart } from "~/features/lms/lib/cart";
import {
  LECTURE_CATEGORY_LABEL,
} from "~/features/lms/lib/lecture-category";
import { ReviewsSection } from "~/features/lms/components/reviews-section";
import { DETAIL_SECTIONS } from "~/features/lms/lib/detail-sections";
import { listSellableLectureProducts } from "~/features/lms/queries.server";
import {
  getMyReview,
  isPurchaser,
  listPublicReviews,
} from "~/features/lms/reviews.server";
import { PRODUCT_KIND_LABEL } from "~/features/subscriptions/labels";

import type { Route } from "./+types/lecture-product-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [
    { title: `${d?.product?.name ?? "수강신청"} | 리담변리사학원` },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  const products = await listSellableLectureProducts(client, user?.id ?? null);
  const product = products.find((p) => p.code === params.productCode);
  if (!product) throw data("강의를 찾을 수 없습니다", { status: 404 });
  const [{ reviews, summary }, myReview, canWrite] = await Promise.all([
    listPublicReviews(client, "plan", product.planId),
    user ? getMyReview(client, user.id, "plan", product.planId) : Promise.resolve(null),
    user ? isPurchaser(client, user.id, "plan", product.planId) : Promise.resolve(false),
  ]);
  return {
    product,
    isAuthed: Boolean(user),
    tossClientKey: process.env.TOSS_CLIENT_KEY ?? null,
    reviews,
    summary,
    myReview,
    canWrite,
  };
}

export default function LectureProductDetail({
  loaderData,
}: Route.ComponentProps) {
  const { product, isAuthed, tossClientKey, reviews, summary, myReview, canWrite } =
    loaderData;
  const { addPlan, addBook, has } = useCart();
  const isTpass = product.productKind === "tpass";
  const inCart = has(`plan:${product.code}`);
  const failPath = `/lecture/catalog/${product.code}?failed=1`;

  const buyNow = () => {
    if (!tossClientKey) return;
    void startCartCheckout(
      [{ kind: "plan", code: product.code }],
      tossClientKey,
      failPath,
    );
  };

  const sections = DETAIL_SECTIONS.filter((sec) => product.detailSections[sec.key]);
  const hasBody = Boolean(
    sections.length > 0 || product.detailImageUrl || product.detailHtml,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-28 md:px-6">
      <Link
        to="/lecture/catalog"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
      >
        <ArrowLeftIcon className="size-4" /> 수강신청으로
      </Link>

      {/* 헤더 — 배지 · 강좌명 · 결제금액 */}
      <div className="mt-4 border-b pb-6">
        <div className="flex flex-wrap items-center gap-2">
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
        <h1 className="mt-3 text-2xl leading-snug font-bold tracking-tight text-balance">
          {product.name}
        </h1>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-muted-foreground text-xs font-semibold">
            수강료
          </span>
          <span className="text-2xl font-bold tabular-nums">
            {product.priceKrw.toLocaleString("ko-KR")}
            <span className="text-muted-foreground ml-0.5 text-sm font-normal">
              원
            </span>
          </span>
        </div>
      </div>

      {/* 본문 — feat-11-008 P5: 섹션(9영역) 우선, 없으면 기존 이미지/HTML 폴백 */}
      {sections.length > 0 ? (
        <div className="mt-6 space-y-8">
          {sections.map((sec) => (
            <section key={sec.key}>
              <h2 className="mb-2 text-lg font-bold tracking-tight">{sec.label}</h2>
              {/* 운영자(staff) 작성 신뢰 HTML — HtmlEditor 원본 보존 정책과 짝. */}
              <div
                className="lecture-detail-html"
                dangerouslySetInnerHTML={{ __html: product.detailSections[sec.key] ?? "" }}
              />
            </section>
          ))}
        </div>
      ) : product.detailImageUrl ? (
        <img
          src={product.detailImageUrl}
          alt={product.name}
          className="mt-6 w-full rounded-lg"
          loading="lazy"
        />
      ) : product.detailHtml ? (
        // 운영자(staff) 작성 CMS 콘텐츠 — 히어로 배너와 동일하게 신뢰.
        <div
          className="lecture-detail-html mt-6"
          dangerouslySetInnerHTML={{ __html: product.detailHtml }}
        />
      ) : null}

      {/* 폴백 — 상세 본문 미설정 시 기본 정보 */}
      {!hasBody ? (
        <div className="mt-6 space-y-6">
          {product.description ? (
            <section>
              <h2 className="mb-2 text-base font-bold">과정 소개</h2>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">
                {product.description}
              </p>
            </section>
          ) : null}
          {product.courses.length > 0 ? (
            <section>
              <h2 className="mb-2 text-base font-bold">포함 강의</h2>
              <ul className="text-muted-foreground space-y-1 text-sm">
                {product.courses.map((c) => (
                  <li key={c.courseId}>· {c.title}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {!product.description && product.courses.length === 0 ? (
            <p className="text-muted-foreground rounded-lg border border-dashed px-5 py-10 text-center text-sm">
              상세 소개가 곧 준비됩니다.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* 포함 교재 — 주/부교재 간소 표시(#17) */}
      {product.books.length > 0 ? (
        <section className="mt-8 border-t pt-6">
          <h2 className="mb-1 text-base font-bold">함께 쓰는 교재</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            강의와 함께 한 번에 결제할 수 있습니다. 상세는 도서 페이지에서 확인하세요.
          </p>
          <ul className="space-y-2">
            {product.books.map((b) => {
              const inBookCart = has(`book:${b.bookId}`);
              return (
                <li
                  key={b.bookId}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <span className="bg-muted h-14 w-10 shrink-0 overflow-hidden rounded border">
                    {b.coverUrl ? (
                      <img
                        src={b.coverUrl}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${b.role === "main" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                      >
                        {b.role === "main" ? "주교재" : "부교재"}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.requirement === "required" ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-muted text-muted-foreground"}`}
                      >
                        {b.requirement === "required" ? "필수" : "선택"}
                      </span>
                      {b.soldOut ? (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          품절
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate font-medium">{b.title}</span>
                    <span className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="tabular-nums">
                        {b.priceKrw.toLocaleString("ko-KR")}원
                      </span>
                      <Link
                        to={`/lecture/books/${b.bookId}`}
                        className="text-link hover:underline"
                      >
                        상세보기
                      </Link>
                    </span>
                  </span>
                  {isAuthed && !b.soldOut ? (
                    inBookCart ? (
                      <Link
                        to="/lecture/cart"
                        className="text-link shrink-0 text-xs font-semibold hover:underline"
                      >
                        담김
                      </Link>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => addBook(b.bookId, 1)}
                        className="shrink-0"
                      >
                        담기
                      </Button>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 수강평 */}
      <ReviewsSection
        targetType="plan"
        targetId={product.planId}
        reviews={reviews}
        summary={summary}
        myReview={myReview}
        canWrite={canWrite}
        isLoggedIn={isAuthed}
        title="수강평"
      />

      {/* 하단 sticky 구매 바 */}
      <div className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-muted-foreground text-xs font-semibold">
              수강료
            </span>
            <span className="text-lg font-bold tabular-nums">
              {product.priceKrw.toLocaleString("ko-KR")}원
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {product.owned ? (
              <Button asChild size="lg" variant="outline">
                <Link to="/lecture">수강 중 · 내 강의실</Link>
              </Button>
            ) : !isAuthed ? (
              <Button asChild size="lg">
                <Link to="/login">로그인 후 수강신청</Link>
              </Button>
            ) : (
              <>
                {inCart ? (
                  <Button asChild size="lg" variant="outline">
                    <Link to="/lecture/cart">
                      <ShoppingCartIcon className="size-4" /> 장바구니
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => addPlan(product.code)}
                  >
                    <ShoppingCartIcon className="size-4" /> 장바구니
                  </Button>
                )}
                <Button size="lg" disabled={!tossClientKey} onClick={buyNow}>
                  수강신청
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
