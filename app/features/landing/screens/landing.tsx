// feat-12 강의 플랫폼 랜딩 — /lecture/home.
//
// ★feat-11-009(요청서_0901 §2) — 고정 화면이 아니라 **모듈 목록으로 조립**한다.
//   운영자가 /admin/main-page 에서 블록을 추가·이동·숨김하면 이 화면이 그대로 바뀐다.
//   섹션 JSX 는 components/builtin-sections.tsx 로 옮겼고(내용 동일), 여기서는 순서대로
//   골라 끼우는 일만 한다.
// ★모듈이 하나도 없으면 예전 고정 순서로 렌더한다 — 시드 전이나 운영자가 실수로 전부
//   지웠을 때 메인화면이 빈 페이지가 되지 않게 하는 안전망이다.
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { getLandingTierGap } from "~/core/lib/app-settings.server";
import adminClient from "~/core/lib/supa-admin-client.server";
import makeServerClient from "~/core/lib/supa-client.server";
import { listBookstoreBooks } from "~/features/bookstore/queries.server";
import { listSupportFaqGroups } from "~/features/cs-inquiries/faq.server";
import { listPasserSummaries } from "~/features/exam-results/analytics.server";
import { listInstructors } from "~/features/instructors/queries.server";
import { listFeaturedReviews } from "~/features/lms/reviews.server";

import { BannerTier } from "../components/banner-tiers";
import {
  BuiltinBooks,
  BuiltinCurriculum,
  BuiltinFaq,
  BuiltinFinal,
  BuiltinInstructors,
  BuiltinNews,
  BuiltinPassers,
  BuiltinReviews,
  BuiltinSchedule,
  BuiltinVideo,
} from "../components/builtin-sections";
import {
  BarBannerModule,
  BoardRecentModule,
  BookListModule,
  FreeHtmlModule,
  LectureListModule,
  YoutubeModule,
} from "../components/custom-modules";
import { HeroCarousel } from "../components/hero-carousel";
import { KakaoFloat } from "../components/kakao-float";
import { LandingStyle } from "../components/landing-style";
import { buildLectureVideosPublic } from "../lib/lecture-videos.server";
import {
  DEVICE_CLASS,
  heroBannerConfigSchema,
  lectureListConfigSchema,
} from "../lib/main-modules";
import type { MainPageModuleRow } from "../queries.server";
import {
  listBanners,
  listLectureVideos,
  listMainPageModules,
  listNews,
  listPlansForModules,
  listSchedules,
} from "../queries.server";

import type { Route } from "./+types/landing";

export function meta() {
  return [
    { title: "리담변리사학원 — 변리사 시험, 합격까지 함께" },
    {
      name: "description",
      content:
        "전임 강사진의 현장강의와 조문·판례·문제 통합 학습으로 변리사 시험 합격까지 함께합니다. 현장강의 일정·수강신청·합격 수기.",
    },
  ];
}

/** 모듈이 하나도 없을 때 쓰는 예전 고정 순서(안전망). */
const FALLBACK_ORDER: Array<MainPageModuleRow["kind"]> = [
  "hero_banner",
  "hero_banner",
  "hero_banner",
  "builtin_video",
  "builtin_news",
  "builtin_schedule",
  "builtin_curriculum",
  "builtin_books",
  "builtin_instructors",
  "builtin_reviews",
  "builtin_passers",
  "builtin_faq",
  "builtin_final",
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const todayISO = new Date().toISOString();
  const [
    modules,
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books,
    featuredReviews,
    videoRows,
  ] = await Promise.all([
    listMainPageModules(client).catch(() => [] as MainPageModuleRow[]),
    listBanners(client),
    listSchedules(client, { todayISO, limit: 4 }),
    // 게시판 모듈이 분류별로 잘라 쓰므로 넉넉히 가져온다(붙박이 섹션은 앞 5건만 쓴다).
    listNews(client, { limit: 30 }),
    listInstructors(client),
    listPasserSummaries({
      year: null,
      round: null,
      limit: 3,
      excludeSynthetic: true,
    }).catch(() => []),
    listSupportFaqGroups(client).catch(() => []),
    // 리담 교재 섹션 — 도서몰(도서구입) 판매중 도서 노출.
    listBookstoreBooks(client).catch(() => []),
    // 운영자 큐레이션 수강 후기 — 강의 랜딩 노출(취사선택). 비로그인(anon)에도 보이도록
    //   adminClient 로 조회(공개·미블라인드만 반환하는 공개-안전 쿼리).
    listFeaturedReviews(adminClient).catch(() => []),
    // 공부방법·맛보기 영상(공개). 요청 클라이언트 RLS(published) 로 조회.
    listLectureVideos(client).catch(() => []),
  ]);
  // 강의진열 모듈이 고른 상품 — 모듈별로 조회하지 않고 한 번에 모아 온다.
  const planIds = [
    ...new Set(
      modules
        .filter((m) => m.kind === "lecture_list")
        .flatMap((m) => lectureListConfigSchema.parse(m.config).planIds),
    ),
  ];
  const plans = await listPlansForModules(client, planIds).catch(() => []);
  // 콜러스 서명 URL·연결 강의 해석은 adminClient(video_contents·subscription_plans anon
  //   제약 대비). cuid=anon("preview-anon") — 접근제어 아닌 통계 매칭용이라 무방.
  const videos = await buildLectureVideosPublic(adminClient, videoRows, null).catch(
    () => [],
  );
  // 히어로 단 사이 간격·색(운영자 설정) — anon 노출 위해 adminClient.
  const tierGap = await getLandingTierGap(adminClient).catch(() => ({
    gapTop: { px: 0, color: null as string | null },
    gap12: { px: 0, color: null as string | null },
    gap23: { px: 0, color: null as string | null },
  }));
  return {
    modules,
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books,
    featuredReviews,
    videos,
    plans,
    tierGap,
    todayISO,
  };
}

export default function Landing({ loaderData }: Route.ComponentProps) {
  const {
    modules,
    banners,
    schedules,
    news,
    instructors,
    passers,
    faqGroups,
    books,
    featuredReviews,
    videos,
    plans,
    tierGap,
    todayISO,
  } = loaderData;
  // tier 1=메인 히어로 캐러셀, 2·3=히어로 아래 추가 단.
  const bannersByTier = (tier: number) =>
    banners.filter((b) => (b.tier ?? 1) === tier);

  // kind → 렌더. config 는 모듈마다 다르므로 각 렌더러가 자기 스키마로 파싱한다.
  const render = (
    kind: MainPageModuleRow["kind"],
    config: Record<string, unknown>,
    seq: number,
  ): ReactNode => {
    switch (kind) {
      case "hero_banner": {
        // 폴백 경로에서는 config 가 없으므로 등장 순서(seq)를 단 번호로 쓴다.
        const tier = Object.keys(config).length
          ? heroBannerConfigSchema.parse(config).tier
          : seq + 1;
        if (tier === 1) {
          return (
            <HeroCarousel
              banners={bannersByTier(1)}
              schedules={schedules}
              todayISO={todayISO}
            />
          );
        }
        return (
          <BannerTier
            banners={bannersByTier(tier)}
            gapClass={tier === 2 ? "btier-gap-12" : "btier-gap-23"}
          />
        );
      }
      case "lecture_list":
        return <LectureListModule config={config} plans={plans} />;
      case "board_recent":
        return <BoardRecentModule config={config} news={news} />;
      case "youtube":
        return <YoutubeModule config={config} />;
      case "book_list":
        return <BookListModule config={config} books={books} />;
      case "bar_banner":
        return <BarBannerModule config={config} />;
      case "free_html":
        return <FreeHtmlModule config={config} />;
      case "builtin_video":
        return <BuiltinVideo videos={videos} />;
      case "builtin_news":
        return <BuiltinNews news={news.slice(0, 5)} />;
      case "builtin_schedule":
        return <BuiltinSchedule schedules={schedules} todayISO={todayISO} />;
      case "builtin_curriculum":
        return <BuiltinCurriculum />;
      case "builtin_books":
        return <BuiltinBooks books={books.slice(0, 6)} />;
      case "builtin_instructors":
        return <BuiltinInstructors instructors={instructors} />;
      case "builtin_reviews":
        return <BuiltinReviews reviews={featuredReviews} />;
      case "builtin_passers":
        return <BuiltinPassers passers={passers} />;
      case "builtin_faq":
        return <BuiltinFaq groups={faqGroups} />;
      case "builtin_final":
        return <BuiltinFinal />;
    }
  };

  const blocks =
    modules.length > 0
      ? modules.map((m, i) => ({
          key: m.moduleId,
          deviceClass: DEVICE_CLASS[m.device],
          node: render(m.kind, m.config, i),
        }))
      : FALLBACK_ORDER.map((kind, i) => ({
          key: `fallback-${i}`,
          deviceClass: "",
          node: render(kind, {}, i),
        }));

  return (
    <div
      className="llx"
      style={
        {
          "--tier-gap-top": `${tierGap.gapTop.px}px`,
          "--tier-gap-top-bg": tierGap.gapTop.color ?? "transparent",
          "--tier-gap": `${tierGap.gap12.px}px`,
          "--tier-gap-bg": tierGap.gap12.color ?? "transparent",
          "--tier-gap-2": `${tierGap.gap23.px}px`,
          "--tier-gap-2-bg": tierGap.gap23.color ?? "transparent",
        } as CSSProperties
      }
    >
      <LandingStyle />
      {blocks.map((b) =>
        // device 분기는 CSS 로 한다 — 서버에서 User-Agent 로 가르면 CDN 캐시가 두 벌 필요해진다.
        // ★기기 제한이 없으면 래퍼를 두지 않는다 — 예전과 DOM 구조가 완전히 같아야
        //   섹션 간 여백(margin collapsing)·랜딩 CSS 가 그대로 먹는다.
        b.deviceClass ? (
          <div className={b.deviceClass} key={b.key}>
            {b.node}
          </div>
        ) : (
          <Fragment key={b.key}>{b.node}</Fragment>
        ),
      )}
      <KakaoFloat />
    </div>
  );
}
