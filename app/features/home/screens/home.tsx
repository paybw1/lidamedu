import type { Route } from "./+types/home";

import i18next from "~/core/lib/i18next.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  type PublicPlatformStats,
  getPublicPlatformStats,
} from "~/features/exam-results/analytics.server";
import { listActiveDiscounts } from "~/features/subscriptions/discounts.server";
import {
  bestAutomaticDiscount,
  effectivePriceKrw,
  openMonthLabel,
} from "~/features/subscriptions/labels";
import { listSubscriptionPlans } from "~/features/subscriptions/queries.server";
import { getLatestLandingFeed } from "~/features/home/latest-feed.server";
import { FaqSection } from "~/features/home/components/faq-section";
import { FeaturesSection } from "~/features/home/components/features-section";
import { FinalCta } from "~/features/home/components/final-cta";
import { FlowSection } from "~/features/home/components/flow-section";
import { Hero } from "~/features/home/components/hero";
import { IntegratedFlowSection } from "~/features/home/components/integrated-flow-section";
import { LatestSection } from "~/features/home/components/latest-section";
import { PasserStatsSection } from "~/features/home/components/passer-stats-section";
import { PreviewSection } from "~/features/home/components/preview-section";
import { PricingTeaserSection } from "~/features/home/components/pricing-teaser-section";
import { SubjectsSection } from "~/features/home/components/subjects-section";
import { TrialCalloutSection } from "~/features/home/components/trial-callout-section";
import { WeaknessEngineSection } from "~/features/home/components/weakness-engine-section";
import { Band } from "~/features/home/lib/landing";

export const meta: Route.MetaFunction = ({ data }) => [
  {
    title:
      data?.title ??
      "리담변리사학원 — 변리사 시험, 이 곳에서 합격까지 함께 해요",
  },
  {
    name: "description",
    content:
      data?.subtitle ??
      "조문·판례·문제·논문이 끊김 없이 이어지는 변리사 학습 플랫폼. 합격자 데이터 기반 컨설팅으로 본인의 학습이 합격자 평균에 얼마나 가까운지 한눈에.",
  },
  { property: "og:title", content: "리담변리사학원 — 변리사 학습 플랫폼" },
  {
    property: "og:description",
    content: "합격자 데이터 기반 컨설팅 + 조문·판례·문제 통합 흐름",
  },
  { property: "og:type", content: "website" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const t = await i18next.getFixedT(request);
  // best-effort — 통계 fetch 실패해도 랜딩은 정상 노출. 신규 디자인은 mock 데이터로
  // 항상 표시하지만, 향후 실제 데이터 연동을 위해 loader 는 유지.
  let stats: PublicPlatformStats | null = null;
  try {
    // 비로그인 랜딩 — 합성 합격자가 마케팅 통계에 섞이지 않도록 차단.
    stats = await getPublicPlatformStats({ excludeSynthetic: true });
  } catch {
    stats = null;
  }

  // 요금제 티저 — 대표 번들(전체 통합)의 할인 적용가. best-effort.
  let bundleTeaser: {
    name: string;
    base: number;
    effective: number;
    learnNote: string | null;
  } | null = null;
  try {
    const [client] = makeServerClient(request);
    const [plans, discounts] = await Promise.all([
      listSubscriptionPlans(client),
      listActiveDiscounts(client),
    ]);
    const bundle =
      plans.find((p) => p.code === "bundle_all") ??
      plans.find((p) => p.productKind === "bundle");
    if (bundle) {
      const nowMs = Date.now();
      const auto = bestAutomaticDiscount(
        bundle,
        bundle.priceKrw,
        discounts,
        nowMs,
      );
      // 학습 개시 예정 과목(상표·디자인 등) 안내 — 개별 상품 available_from 미래.
      const cs = plans.filter(
        (p) =>
          p.productKind === "subject" &&
          p.availableFrom &&
          new Date(p.availableFrom).getTime() > nowMs,
      );
      bundleTeaser = {
        name: bundle.name,
        base: bundle.priceKrw,
        effective: auto
          ? effectivePriceKrw(bundle.priceKrw, auto)
          : bundle.priceKrw,
        learnNote: cs.length
          ? `${cs.map((p) => p.name).join("·")}은 ${openMonthLabel(cs[0].availableFrom as string)}부터 학습 가능`
          : null,
      };
    }
  } catch {
    bundleTeaser = null;
  }

  // LATEST 섹션 — 실데이터 최신 피드(각 카테고리 최신 1건). best-effort.
  let latestFeed: Awaited<ReturnType<typeof getLatestLandingFeed>> = [];
  try {
    const [client] = makeServerClient(request);
    latestFeed = await getLatestLandingFeed(client);
  } catch {
    latestFeed = [];
  }

  return {
    title: t("home.title"),
    subtitle: t("home.subtitle"),
    stats,
    bundleTeaser,
    latestFeed,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <div
      data-screen-label="lidam-landing"
      style={{
        background: "var(--background)",
        minHeight: "100vh",
        color: "var(--foreground)",
        fontFamily:
          'Pretendard, "Pretendard Variable", -apple-system, system-ui, sans-serif',
      }}
    >
      <Hero />
      <TrialCalloutSection />
      <Band tone="shelf">
        <WeaknessEngineSection />
      </Band>
      <PreviewSection />
      <Band tone="shelf">
        <FeaturesSection />
      </Band>
      <IntegratedFlowSection />
      <Band tone="shelf">
        <SubjectsSection />
      </Band>
      <PasserStatsSection />
      <Band tone="shelf">
        <LatestSection items={loaderData.latestFeed} />
      </Band>
      <PricingTeaserSection bundleTeaser={loaderData.bundleTeaser} />
      <Band tone="shelf">
        <FlowSection />
      </Band>
      <FaqSection />
      <FinalCta />
    </div>
  );
}
