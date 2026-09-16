// 수강신청 상세(강의 플랫폼) — /lecture/catalog/:productCode.
//   카탈로그 카드 클릭 → 이 화면. 본문 = 운영자 입력 이미지 또는 HTML(히어로 배너와 동일 방식),
//   없으면 소개·포함 강의·교재 기본 정보로 폴백. 하단 sticky 담기/수강신청.
import { RichHtml } from "~/features/lms/components/rich-html";
import { PriceTag } from "~/features/lms/components/price-tag";
import {
  ArrowLeftIcon,
  CheckIcon,
  GraduationCapIcon,
  ShoppingCartIcon,
  TicketIcon,
} from "lucide-react";
import { Link, data } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { AsyncActionButton } from "~/core/components/async-action-button";
import { Button } from "~/core/components/ui/button";
import makeServerClient from "~/core/lib/supa-client.server";
import { useState } from "react";

import { CheckoutSheet } from "~/features/orders/components/checkout-sheet";
import { useCart } from "~/features/lms/lib/cart";
import {
  LECTURE_CATEGORY_LABEL,
} from "~/features/lms/lib/lecture-category";
import { ReviewsSection } from "~/features/lms/components/reviews-section";
import { COURSE_FORMAT_LABEL } from "~/features/lms/lib/course-format";
import { DETAIL_SECTIONS } from "~/features/lms/lib/detail-sections";
import { listSellableLectureProducts } from "~/features/lms/queries.server";
import {
  getMyReview,
  isPurchaser,
  listPublicReviews,
} from "~/features/lms/reviews.server";
import { PRODUCT_KIND_LABEL } from "~/features/subscriptions/labels";

import type { Route } from "./+types/lecture-product-detail";
import { excerpt, pageMeta } from "~/core/lib/seo";

export const meta: Route.MetaFunction = (a) => {
  const p = a.data?.product;
  return pageMeta(
    {
      title: p?.name ?? "수강신청",
      description:
        excerpt(p?.description) ||
        `${p?.name ?? "리담변리사학원 강의"} — 수강기간·가격·포함 강의를 확인하고 신청합니다.`,
    },
    a,
  );
};

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
  const failPath = `/lecture/catalog/${product.code}`;

  // ★시트를 먼저 연다(결제수단 선택). 결제창을 여는 일은 시트가 맡는다.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const buyNow = async () => {
    if (!tossClientKey) return;
    setCheckoutOpen(true);
  };

  const sections = DETAIL_SECTIONS.filter((sec) => product.detailSections[sec.key]);
  const hasBody = Boolean(
    sections.length > 0 || product.detailImageUrl || product.detailHtml,
  );

  return (
    // PC 최대폭 1230px · 가운데 정렬 · 모바일은 100% 반응형(원장 요청 2026-08-20).
    // 하단 sticky 구매 바도 같은 폭이라 본문과 좌우가 맞는다.
    // ★폰에서 구매바가 두 줄이 되면 높이가 약 65px → 110px 로 는다 — 본문 아래 여백도
    //   함께 올리지 않으면 마지막 수강평이 바에 가린다.
    <div className="mx-auto w-full max-w-[1230px] px-4 pt-8 pb-36 md:px-6 md:pb-28">
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
          {product.courseFormat ? (
            <Badge variant="outline" className="text-[11px]">
              {COURSE_FORMAT_LABEL[product.courseFormat]}
            </Badge>
          ) : null}
          {/* ★카드는 categoryName(course_categories), 상세만 낡은 lecture_category 를 봤다.
              feat-11-008 D2 에서 쓰기 중단된 축이라 값이 없는 상품은 카드엔 배지가 뜨고
              상세엔 안 떴다. 카드와 같은 소스로 맞춘다(feat-11-012 P4). */}
          {product.categoryName ? (
            <Badge variant="outline" className="text-[11px]">
              {product.categoryName}
            </Badge>
          ) : null}
          {/* ★수강 기간 — 기간제는 「N일」, 고정 종료일 상품은 「YYYY-MM-DD 까지」.
              durationDays 0(=고정 종료일)만 보고 줄을 빼면 학생이 언제까지 듣는지
              알 수 없게 된다(feat-11-013 P0-3). */}
          {product.durationDays > 0 ? (
            <span className="text-muted-foreground text-[11px]">
              {product.durationDays}일 수강
            </span>
          ) : product.fixedEndDate ? (
            <span className="text-muted-foreground text-[11px]">
              {product.fixedEndDate} 까지 수강
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-2xl leading-snug font-bold tracking-tight text-balance">
          {product.name}
        </h1>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-muted-foreground text-xs font-semibold">
            수강료
          </span>
          <PriceTag
            size="lg"
            priceKrw={product.priceKrw}
            listPriceKrw={product.listPriceKrw}
          />
        </div>
      </div>

      {/* 구매 판단에 필요한 것 — 강사 · 회차 · 포함 강의 (feat-11-012 P4).
          ★본문 유무 분기 **밖**에 둔다. 종전에는 포함 강의가 "본문 없음" 분기 안에 있어,
            운영자가 소개를 한 칸이라도 채우면 통째로 사라졌다 —
            **본문을 잘 꾸민 상품일수록 이 정보가 안 보였다.**
          ★값이 없으면 그 줄만 뺀다("0회차"·"강사 미정"을 찍지 않는다). */}
      {product.instructors.length > 0 ||
      product.lessonCount > 0 ||
      product.courses.length > 0 ? (
        <section className="bg-card/50 mt-5 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:flex-wrap sm:gap-x-10">
          {product.instructors.length > 0 ? (
            <div>
              <span className="text-muted-foreground text-[11px] font-semibold">
                강사
              </span>
              <div className="mt-0.5 flex flex-wrap gap-x-2 text-sm font-medium">
                {product.instructors.map((i) => (
                  <Link
                    key={i.slug}
                    to={`/about/instructors/${i.slug}`}
                    className="hover:underline"
                  >
                    {i.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {product.lessonCount > 0 ? (
            <div>
              <span className="text-muted-foreground text-[11px] font-semibold">
                회차
              </span>
              <div className="mt-0.5 text-sm font-medium tabular-nums">
                {product.lessonCount}회차
              </div>
            </div>
          ) : null}
          {product.courses.length > 0 ? (
            <div className="min-w-0 flex-1">
              <span className="text-muted-foreground text-[11px] font-semibold">
                포함 강의
              </span>
              <ul className="mt-0.5 space-y-0.5 text-sm">
                {product.courses.map((c) => (
                  <li key={c.courseId}>{c.title}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 본문 — feat-11-008 P5: 섹션(9영역) 우선, 없으면 기존 이미지/HTML 폴백 */}
      {sections.length > 0 ? (
        <div className="mt-6 space-y-8">
          {sections.map((sec) => (
            <section key={sec.key}>
              <h2 className="mb-2 text-lg font-bold tracking-tight">{sec.label}</h2>
              {/* 운영자(staff) 작성 신뢰 HTML — HtmlEditor 원본 보존 정책과 짝.
                  RichHtml = <script> 까지 실행(이벤트 페이지 카운트다운·리빌 등). */}
              <RichHtml
                className="lecture-detail-html"
                html={product.detailSections[sec.key] ?? ""}
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
        <RichHtml
          className="lecture-detail-html mt-6"
          html={product.detailHtml}
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
          {/* 포함 강의는 위 구매정보 블록으로 올라갔다 — 본문 유무와 무관하게 보여야 한다. */}
          {!product.description ? (
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
        {/* ★겹침의 원인은 본문 여백이 아니라 **바 내부**였다 — 가격 블록은 min-w-0 이라 줄고
            버튼 두 개는 shrink-0 이라 안 줄어, 좁은 화면에서 숫자가 버튼 밑으로 깔렸다.
            폰에서는 가격 줄과 버튼 줄을 나눈다(feat-11-012 P2). */}
        <div className="mx-auto flex w-full max-w-[1230px] flex-col items-stretch gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground text-xs font-semibold">
              수강료
            </span>
            <PriceTag
              priceKrw={product.priceKrw}
              listPriceKrw={product.listPriceKrw}
            />
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
                <AsyncActionButton
                  size="lg"
                  disabled={!tossClientKey}
                  onRun={buyNow}
                  pendingLabel="결제 준비 중…"
                >
                  수강신청
                </AsyncActionButton>
                <CheckoutSheet
                  open={checkoutOpen}
                  onOpenChange={setCheckoutOpen}
                  items={[{ kind: "plan", code: product.code }]}
                  tossClientKey={tossClientKey}
                  failPath={failPath}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
