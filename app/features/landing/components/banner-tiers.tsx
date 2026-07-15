// feat-12 히어로 아래 추가 단(2·3단) 배너 밴드. 이미지/HTML/구조형(간이 카드) 지원.
//   tier 로 나눈 배너를 각 밴드(band)로 렌더. *.server 값 import 금지(빌드 함정).
import { Link } from "react-router";

import { fitBannerFrame, htmlHasScript, type BannerRow } from "../labels";

function Block({ b }: { b: BannerRow }) {
  // 콘텐츠 기준 렌더 — 이미지 있으면 이미지, 없고 HTML 있으면 HTML(kind 오설정 안전).
  if (b.image_url) {
    // maxWidth 지정 시 가운데 정렬 + 원본 비율(꽉 채우지 않음).
    const style = b.image_max_width
      ? { maxWidth: `${b.image_max_width}px`, margin: "0 auto" }
      : undefined;
    const img = (
      <img className="bt-img" src={b.image_url} alt={b.headline || "배너"} loading="lazy" style={style} />
    );
    return b.cta_href ? (
      <Link to={b.cta_href} className="bt-block bt-imglink">
        {img}
      </Link>
    ) : (
      <div className="bt-block">{img}</div>
    );
  }
  if (b.body_html) {
    // 스크립트 포함 시 iframe(srcdoc)으로 격리 실행, 아니면 인라인 렌더.
    return htmlHasScript(b.body_html) ? (
      <iframe
        className="bt-block bt-htmlframe"
        title={b.headline || "배너"}
        srcDoc={b.body_html}
        scrolling="no"
        onLoad={(e) => fitBannerFrame(e.currentTarget)}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      />
    ) : (
      <div
        className="bt-block bt-html"
        // 운영자(staff) 작성 랜딩 CMS 콘텐츠 — 코드 편집과 동등한 신뢰 경계.
        dangerouslySetInnerHTML={{ __html: b.body_html }}
      />
    );
  }
  // 구조형(텍스트) — 간이 카드.
  return (
    <div className={`bt-block bt-card ${b.accent}`}>
      {b.eyebrow ? <span className="bt-eye">{b.eyebrow}</span> : null}
      {b.headline ? <h3>{b.headline}</h3> : null}
      {b.sub ? <p>{b.sub}</p> : null}
      {b.cta_label ? (
        <Link className="btn gilt" to={b.cta_href || "#"}>
          {b.cta_label} →
        </Link>
      ) : null}
    </div>
  );
}

function Tier({ banners }: { banners: BannerRow[] }) {
  if (banners.length === 0) return null;
  return (
    <section className="btier">
      <div className="wrap">
        <div className={`bt-grid${banners.length === 1 ? " one" : ""}`}>
          {banners.map((b) => (
            <Block b={b} key={b.banner_id} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function BannerTiers({ tier2, tier3 }: { tier2: BannerRow[]; tier3: BannerRow[] }) {
  if (tier2.length === 0 && tier3.length === 0) return null;
  return (
    <>
      <Tier banners={tier2} />
      <Tier banners={tier3} />
    </>
  );
}
