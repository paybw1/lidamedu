// feat-12 강의 플랫폼 랜딩 히어로 — 편집형 배너 자동 순환 캐러셀(클라이언트).
// 배너 목록은 운영자가 편집(landing_banners). 마우스 오버 정지·감속 설정 존중.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useSwipe } from "~/core/hooks/use-swipe";

import type { SiteFact } from "../lib/site-intro";

import { Headline, ScheduleHeroCard, TrustStrip } from "./hero-parts";

import {
  ddayFrom,
  fitBannerFrame,
  htmlHasScript,
  remainingSeats,
  type BannerRow,
  type ScheduleRow,
} from "../labels";

// headline 안에서 highlight 부분만 금박 강조.
// 이미지 배너 — 슬라이드 전체를 이미지로. cta_href 있으면 클릭 이동.
//   maxWidth 지정 시: 가운데 정렬 + 원본 비율(꽉 채우지 않음). 미지정: 전체 폭 cover.
function BannerImage({
  src,
  alt,
  href,
  maxWidth,
}: {
  src: string;
  alt: string;
  href: string | null;
  maxWidth: number | null;
}) {
  const style = maxWidth ? { maxWidth: `${maxWidth}px` } : undefined;
  const img = <img className="slide-img" src={src} alt={alt} style={style} />;
  return href ? (
    <Link to={href} className="slide-imglink" style={style}>
      {img}
    </Link>
  ) : (
    img
  );
}

function Cta({ banner }: { banner: BannerRow }) {
  return (
    <div className="cta">
      {banner.cta_label ? (
        <Link className="btn gilt" to={banner.cta_href || "#"}>
          {banner.cta_label} →
        </Link>
      ) : null}
      {banner.secondary_label ? (
        <Link className="btn ghost on-navy" to={banner.secondary_href || "#"}>
          {banner.secondary_label}
        </Link>
      ) : null}
    </div>
  );
}

function RightCard({
  banner,
  schedules,
  todayISO,
}: {
  banner: BannerRow;
  schedules: ScheduleRow[];
  todayISO: string;
}) {
  if (banner.kind === "schedule") {
    return <ScheduleHeroCard schedules={schedules} todayISO={todayISO} />;
  }
  if (banner.kind === "passer") {
    return (
      <div className="promo">
        {/* ★종전에는 "2026 · PASS" 가 코드에 박혀 있어 해가 바뀌면 홈만 틀렸다.
            promo 배너가 이미 쓰는 eyebrow 필드로 내려 /admin/landing-banners 에서 고친다. */}
        {banner.eyebrow ? <span className="pk">{banner.eyebrow}</span> : null}
        <div className="pbadges">
          {banner.badges.map((b, i) => (
            <span key={i}>{b}</span>
          ))}
        </div>
        {banner.sub ? <p>{banner.sub}</p> : null}
        {banner.cta_label ? (
          <Link className="btn gilt" to={banner.cta_href || "#"}>
            {banner.cta_label}
          </Link>
        ) : null}
      </div>
    );
  }
  if (banner.kind === "promo" && banner.big_value) {
    return (
      <div className="promo">
        {banner.eyebrow ? <span className="pk">{banner.eyebrow}</span> : null}
        <div className="pbig tnum">
          {banner.big_value}
          {banner.big_unit ? <span>{banner.big_unit}</span> : null}
        </div>
        {banner.sub ? <p>{banner.sub}</p> : null}
        {banner.cta_label ? (
          <Link className="btn gilt" to={banner.cta_href || "#"}>
            {banner.cta_label}
          </Link>
        ) : null}
      </div>
    );
  }
  return null; // custom → 텍스트만(좌측 1열)
}

export function HeroCarousel({
  banners,
  schedules,
  todayISO,
  facts,
}: {
  banners: BannerRow[];
  schedules: ScheduleRow[];
  /** 첫 화면 지표 — 코드 상수가 아니라 loader 실측값(site-intro.ts buildSiteFacts). */
  facts: SiteFact[];
  todayISO: string;
}) {
  const n = banners.length;
  const [idx, setIdx] = useState(0);
  const [anim, setAnim] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reduce = useRef(false);

  const go = useCallback((k: number) => setIdx(((k % n) + n) % n), [n]);

  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);
  const start = useCallback(() => {
    if (reduce.current || n <= 1) return;
    stop();
    timer.current = setInterval(() => setIdx((i) => (i + 1) % n), 6000);
  }, [n, stop]);

  useEffect(() => {
    reduce.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    // 초기 점프 방지 후 애니메이션 활성.
    const r = requestAnimationFrame(() => setAnim(true));
    start();
    return () => {
      cancelAnimationFrame(r);
      stop();
    };
  }, [start, stop]);

  // ★손가락으로 넘기기 + 자동 넘김 정지. 종전에는 멈추는 조건이 마우스 올림뿐이라
  //   **터치 기기에서는 멈출 방법이 아예 없었다** — 읽는 도중 6초마다 배너가 바뀌고,
  //   그 순간 버튼을 누르면 엉뚱한 배너로 갔다. 손가락이 닿으면 자동 넘김을 멈춘다.
  const swipe = useSwipe({
    onPrev: () => go(idx - 1),
    onNext: () => go(idx + 1),
    onTouchStart: stop,
  });

  if (n === 0) return null;

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="메인 배너"
      {...swipe}
      onMouseEnter={stop}
      onMouseLeave={start}
      onFocusCapture={stop}
      onBlurCapture={start}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          go(idx - 1);
          start();
        } else if (e.key === "ArrowRight") {
          go(idx + 1);
          start();
        }
      }}
    >
      <div
        className={anim ? "track anim" : "track"}
        style={{ transform: `translateX(${-idx * 100}%)` }}
      >
        {banners.map((b) => (
          <div
            className={`slide ${b.accent}${
              b.image_url
                ? b.image_max_width
                  ? " imgslide fit"
                  : " imgslide"
                : b.body_html
                  ? " htmlslide"
                  : ""
            }`}
            key={b.banner_id}
            role="group"
            aria-roledescription="슬라이드"
          >
            {/* 콘텐츠 기준 렌더 — 이미지 있으면 이미지, 없고 HTML 있으면 HTML(kind 오설정 안전) */}
            {b.image_url ? (
              <BannerImage src={b.image_url} alt={b.headline || "배너"} href={b.cta_href} maxWidth={b.image_max_width} />
            ) : b.body_html ? (
              htmlHasScript(b.body_html) ? (
                // 스크립트 포함 HTML — iframe(srcdoc)으로 격리 실행(innerHTML 은 미실행).
                //   staff 작성 = 코드 편집과 동등한 신뢰. 슬라이드 높이를 채운다.
                <iframe
                  className="slide-htmlframe"
                  title={b.headline || "배너"}
                  srcDoc={b.body_html}
                  scrolling="no"
                  onLoad={(e) => fitBannerFrame(e.currentTarget)}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                />
              ) : (
                <div
                  className="slide-html"
                  // 운영자(staff)가 작성하는 랜딩 CMS 콘텐츠 — 코드 편집과 동등한 신뢰 경계.
                  dangerouslySetInnerHTML={{ __html: b.body_html }}
                />
              )
            ) : (
            <div className="wrap hero-in">
              <div>
                {b.eyebrow ? <p className="eyebrow">{b.eyebrow}</p> : null}
                <h1>
                  <Headline text={b.headline} hl={b.highlight} />
                </h1>
                {b.sub ? <p className="sub">{b.sub}</p> : null}
                <Cta banner={b} />
                {b.kind === "schedule" ? <TrustStrip facts={facts} /> : null}
              </div>
              <RightCard banner={b} schedules={schedules} todayISO={todayISO} />
            </div>
            )}
          </div>
        ))}
      </div>

      {n > 1 ? (
        <>
          <button
            className="cnav prev"
            aria-label="이전 배너"
            onClick={() => {
              go(idx - 1);
              start();
            }}
          >
            ‹
          </button>
          <button
            className="cnav next"
            aria-label="다음 배너"
            onClick={() => {
              go(idx + 1);
              start();
            }}
          >
            ›
          </button>
          <div className="dots" role="tablist" aria-label="배너 선택">
            {banners.map((b, k) => (
              <button
                key={b.banner_id}
                className={k === idx ? "on" : ""}
                role="tab"
                aria-selected={k === idx}
                aria-label={`${k + 1}번 배너`}
                onClick={() => {
                  go(k);
                  start();
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
