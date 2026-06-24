import type { Route } from "./+types/home";

import i18next from "~/core/lib/i18next.server";
import {
  type PublicPlatformStats,
  getPublicPlatformStats,
} from "~/features/exam-results/analytics.server";
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
import { WeaknessEngineSection } from "~/features/home/components/weakness-engine-section";

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
  return {
    title: t("home.title"),
    subtitle: t("home.subtitle"),
    stats,
  };
}

export default function Home() {
  return (
    <div
      data-screen-label="lidam-landing"
      style={{
        background: "#ffffff",
        minHeight: "100vh",
        color: "rgba(0, 0, 0, 0.84)",
        fontFamily:
          'Pretendard, "Pretendard Variable", -apple-system, system-ui, sans-serif',
      }}
    >
      <Hero />
      <WeaknessEngineSection />
      <PreviewSection />
      <FeaturesSection />
      <IntegratedFlowSection />
      <SubjectsSection />
      <PasserStatsSection />
      <LatestSection />
      <PricingTeaserSection />
      <FlowSection />
      <FaqSection />
      <FinalCta />
    </div>
  );
}
