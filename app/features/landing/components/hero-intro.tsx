// 소개 히어로 (feat-11-012 P3) — 첫 화면에 "무엇을 파는 곳인지" 쓴 문장을 세운다.
//
// ★실측(2026-09-14): 운영 배너가 **전부 이미지형**이라 /lecture/home 의 <h1> 이 **0개**였다.
//   배너가 0건일 때만 문제인 줄 알았는데, 이미지 배너만 있어도 페이지의 유일한 텍스트가
//   alt 속성뿐이다 — 검색으로 들어온 사람이 읽을 문장이 없다.
//   그래서 두 모양을 둔다.
//     hero — 배너가 0건일 때. 배너 자리를 대신한다.
//     band — 이미지 배너만 있을 때. **배너는 그대로 두고** 그 아래 한 줄을 더한다
//            (운영자가 고른 배너 디자인을 건드리지 않는다).
//   텍스트 배너가 이미 h1 을 내고 있으면 둘 다 그리지 않는다.
//
// ★새 모듈 종류를 만들지 않는다 — 메인화면 모듈은 DB(main_page_modules)가 순서를 쥐고 있어
//   kind 를 늘리면 시드 행 INSERT 까지 해야 화면에 나온다. 폴백은 분기 하나로 끝난다.
import { Link } from "react-router";

import { SITE_INTRO, type SiteFact } from "../lib/site-intro";
import type { BannerRow, ScheduleRow } from "../labels";

import { Headline, ScheduleHeroCard, TrustStrip } from "./hero-parts";

/**
 * tier1 배너 중 **h1 을 내는 것**(이미지도 HTML 도 아닌 텍스트 슬라이드)이 있는가.
 * 캐러셀의 렌더 분기(image_url → 이미지 / body_html → HTML / 그 외 → 제목+본문)와 같은 기준.
 */
export function hasTextHero(banners: BannerRow[]): boolean {
  return banners.some((b) => !b.image_url && !b.body_html);
}

export function HeroIntro({
  facts,
  schedules,
  todayISO,
  variant = "hero",
}: {
  facts: SiteFact[];
  schedules: ScheduleRow[];
  todayISO: string;
  variant?: "hero" | "band";
}) {
  if (variant === "band") {
    return (
      <section className="introband" aria-label="학원 소개">
        <div className="in">
          <h1>
            <Headline text={SITE_INTRO.headline} hl={SITE_INTRO.highlight} />
          </h1>
          <p>{SITE_INTRO.description}</p>
          <div className="cta">
            <Link className="btn primary sm" to={SITE_INTRO.primary.to}>
              {SITE_INTRO.primary.label}
            </Link>
            <Link className="btn ghost sm" to={SITE_INTRO.secondary.to}>
              {SITE_INTRO.secondary.label}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="hero-carousel" aria-label="학원 소개">
      <div className="track">
        <div className="slide gilt">
          <div className="wrap hero-in">
            <div>
              <p className="eyebrow">{SITE_INTRO.eyebrow}</p>
              <h1>
                <Headline
                  text={SITE_INTRO.headline}
                  hl={SITE_INTRO.highlight}
                />
              </h1>
              <p className="sub">{SITE_INTRO.description}</p>
              <div className="cta">
                <Link className="btn gilt" to={SITE_INTRO.primary.to}>
                  {SITE_INTRO.primary.label}
                </Link>
                <Link
                  className="btn ghost on-navy"
                  to={SITE_INTRO.secondary.to}
                >
                  {SITE_INTRO.secondary.label}
                </Link>
              </div>
              <TrustStrip facts={facts} />
            </div>
            <ScheduleHeroCard schedules={schedules} todayISO={todayISO} />
          </div>
        </div>
      </div>
    </section>
  );
}
