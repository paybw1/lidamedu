// feat-12 강의 플랫폼 랜딩 히어로 — 편집형 배너 자동 순환 캐러셀(클라이언트).
// 배너 목록은 운영자가 편집(landing_banners). 마우스 오버 정지·감속 설정 존중.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import {
  ddayFrom,
  htmlHasScript,
  remainingSeats,
  type BannerRow,
  type ScheduleRow,
} from "../labels";

// headline 안에서 highlight 부분만 금박 강조.
function Headline({ text, hl }: { text: string; hl: string | null }) {
  if (!hl || !text.includes(hl)) return <>{text}</>;
  const i = text.indexOf(hl);
  return (
    <>
      {text.slice(0, i)}
      <span className="hl">{hl}</span>
      {text.slice(i + hl.length)}
    </>
  );
}

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
    const top = schedules.slice(0, 3);
    return (
      <div className="hcard" aria-label="개강 임박 강의">
        <div className="hh">
          <span className="lab">개강 임박</span>
          <span className="live">
            <span className="dot" />
            실시간 접수중
          </span>
        </div>
        {top.length === 0 ? (
          <p style={{ color: "var(--hero-soft)", fontSize: 13, padding: "8px 4px" }}>
            예정된 개강 일정이 곧 공개됩니다.
          </p>
        ) : (
          top.map((s) => {
            const d = ddayFrom(s.start_date, todayISO);
            return (
              <div className="hrow" key={s.schedule_id}>
                <div className="dday">
                  <b>{d === null ? "예정" : `D-${d}`}</b>
                  <span>{s.start_date ? s.start_date.slice(5).replace("-", "/") : ""} 개강</span>
                </div>
                <div className="mid">
                  <div className="s">
                    {s.subject_label} {s.title}
                  </div>
                  <div className="m">
                    {s.instructor_name}
                    {s.day_label ? ` · ${s.day_label}` : ""}
                  </div>
                </div>
                <div className="seat">잔여 {remainingSeats(s)}석</div>
              </div>
            );
          })
        )}
      </div>
    );
  }
  if (banner.kind === "passer") {
    return (
      <div className="promo">
        <span className="pk">2026 · PASS</span>
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
}: {
  banners: BannerRow[];
  schedules: ScheduleRow[];
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

  if (n === 0) return null;

  return (
    <section
      className="hero-carousel"
      aria-roledescription="carousel"
      aria-label="메인 배너"
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
              b.kind === "image" && b.image_url
                ? b.image_max_width
                  ? " imgslide fit"
                  : " imgslide"
                : b.kind === "html" && b.body_html
                  ? " htmlslide"
                  : ""
            }`}
            key={b.banner_id}
            role="group"
            aria-roledescription="슬라이드"
          >
            {b.kind === "image" && b.image_url ? (
              <BannerImage src={b.image_url} alt={b.headline || "배너"} href={b.cta_href} maxWidth={b.image_max_width} />
            ) : b.kind === "html" && b.body_html ? (
              htmlHasScript(b.body_html) ? (
                // 스크립트 포함 HTML — iframe(srcdoc)으로 격리 실행(innerHTML 은 미실행).
                //   staff 작성 = 코드 편집과 동등한 신뢰. 슬라이드 높이를 채운다.
                <iframe
                  className="slide-htmlframe"
                  title={b.headline || "배너"}
                  srcDoc={b.body_html}
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
                {b.kind === "schedule" ? (
                  <div className="trust">
                    <div className="t">
                      <span className="n">
                        8<span className="u">인</span>
                      </span>
                      <span className="l">전 과목 전임 강사</span>
                    </div>
                    <div className="t">
                      <span className="n">
                        5<span className="u">과목</span>
                      </span>
                      <span className="l">1·2차 통합 커리큘럼</span>
                    </div>
                    <div className="t">
                      <span className="n">
                        3<span className="u">종</span>
                      </span>
                      <span className="l">현장·실시간·영상</span>
                    </div>
                  </div>
                ) : null}
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
