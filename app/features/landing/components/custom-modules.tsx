// feat-11-009 — 요청서 §2 의 모듈 7종 렌더러.
//
// 데이터는 모듈이 스스로 가져오지 않는다. 화면 loader 가 한 번에 모아 오고 여기서는 고르기만
// 한다 — 모듈마다 조회하면 모듈 수만큼 요청이 늘고 워터폴이 생긴다.
// 마크업은 기존 랜딩 CSS(band·wrap·shead·bk…)를 그대로 써서 붙박이 섹션과 이질감이 없게 한다.
import { Link } from "react-router";

import { RichHtml } from "~/features/lms/components/rich-html";

import { Reveal } from "./reveal";
import { newsKindChipClass, newsKindLabel } from "../labels";
import type { NewsRow } from "../labels";
import {
  barBannerConfigSchema,
  bookListConfigSchema,
  boardRecentConfigSchema,
  freeHtmlConfigSchema,
  lectureListConfigSchema,
  youtubeConfigSchema,
  youtubeId,
} from "../lib/main-modules";
import type { LandingBook } from "./builtin-sections";

/** 섹션 머리 — 붙박이 섹션의 shead 와 같은 구조. */
function Head({
  eyebrow,
  heading,
  moreHref,
  moreLabel,
}: {
  eyebrow: string;
  heading: string;
  moreHref?: string;
  moreLabel?: string;
}) {
  return (
    <Reveal className="shead">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        {heading ? <h2>{heading}</h2> : null}
      </div>
      {moreHref ? (
        <Link className="more" to={moreHref}>
          {moreLabel ?? "전체 보기"} →
        </Link>
      ) : null}
    </Reveal>
  );
}

export interface LandingPlan {
  planId: string;
  code: string;
  name: string;
  description: string | null;
  priceKrw: number;
  listPriceKrw: number | null;
  thumbnailUrl: string | null;
}

// ── 강의진열 ────────────────────────────────────────────────────────────
export function LectureListModule({
  config,
  plans,
}: {
  config: Record<string, unknown>;
  plans: LandingPlan[];
}) {
  const c = lectureListConfigSchema.parse(config);
  // 설정한 순서 그대로 — 상품 목록 정렬이 아니라 운영자가 고른 진열 순서다.
  const order = new Map(c.planIds.map((id, i) => [id, i] as const));
  const items = plans
    .filter((p) => order.has(p.planId))
    .sort((a, b) => (order.get(a.planId) ?? 0) - (order.get(b.planId) ?? 0));
  if (items.length === 0) return null;
  return (
    <section className="band">
      <div className="wrap">
        <Head
          eyebrow={c.eyebrow}
          heading={c.heading}
          moreHref={c.moreHref}
          moreLabel="전체 상품"
        />
        <Reveal className="books">
          {items.map((p) => (
            <Link
              className="bk"
              to={`/lecture/catalog/${p.code}`}
              key={p.planId}
            >
              <div className="cov">
                {p.thumbnailUrl ? (
                  <img
                    className="bkimg"
                    src={p.thumbnailUrl}
                    alt={p.name}
                    loading="lazy"
                  />
                ) : (
                  <span className="bt">{p.name}</span>
                )}
              </div>
              <span className="bkt">{p.name}</span>
              <span className="cap tnum">
                {p.priceKrw.toLocaleString("ko-KR")}원
              </span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ── 공지사항 / 게시판 ───────────────────────────────────────────────────
export function BoardRecentModule({
  config,
  news,
}: {
  config: Record<string, unknown>;
  news: NewsRow[];
}) {
  const c = boardRecentConfigSchema.parse(config);
  const rows = (c.source === "all" ? news : news.filter((n) => n.kind === c.source))
    .slice(0, c.limit);
  if (rows.length === 0) return null;
  return (
    <section className="band">
      <div className="wrap">
        <Head
          eyebrow={c.eyebrow}
          heading={c.heading}
          moreHref={c.moreHref}
          moreLabel="전체"
        />
        <Reveal className="newslist">
          {rows.map((it) => (
            <Link
              className="nrow"
              to={`/lecture/news/${it.news_id}`}
              key={it.news_id}
            >
              <span className={`chip ${newsKindChipClass(it.kind)}`}>
                {newsKindLabel(it.kind)}
              </span>
              <span className="nt">{it.title}</span>
              <span className="nd tnum">
                {it.published_at.slice(5, 10).replace("-", "/")}
              </span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ── 유튜브 영상 ─────────────────────────────────────────────────────────
export function YoutubeModule({ config }: { config: Record<string, unknown> }) {
  const c = youtubeConfigSchema.parse(config);
  const ids = c.urls.map(youtubeId).filter((v): v is string => v !== null);
  if (ids.length === 0) return null;
  return (
    <section className="band tint">
      <div className="wrap">
        <Head eyebrow={c.eyebrow} heading={c.heading} />
        <Reveal className="books">
          {ids.map((id) => (
            <div key={id} style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={`https://www.youtube.com/embed/${id}`}
                title="유튜브 영상"
                loading="lazy"
                allowFullScreen
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                  borderRadius: 12,
                }}
              />
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ── 도서상품 진열 ───────────────────────────────────────────────────────
export function BookListModule({
  config,
  books,
}: {
  config: Record<string, unknown>;
  books: LandingBook[];
}) {
  const c = bookListConfigSchema.parse(config);
  // 고른 게 없으면 최신 6권(기존 리담 교재 섹션과 같은 기본값).
  const items = c.bookIds.length
    ? c.bookIds
        .map((id) => books.find((b) => b.bookId === id))
        .filter((b): b is LandingBook => Boolean(b))
    : books.slice(0, 6);
  if (items.length === 0) return null;
  return (
    <section className="band tint">
      <div className="wrap">
        <Head
          eyebrow={c.eyebrow}
          heading={c.heading}
          moreHref={c.moreHref}
          moreLabel="도서몰"
        />
        <Reveal className="books">
          {items.map((b) => (
            <Link className="bk" to={`/lecture/books/${b.bookId}`} key={b.bookId}>
              <div className="cov">
                {b.coverPath ? (
                  <img
                    className="bkimg"
                    src={b.coverPath}
                    alt={b.title}
                    loading="lazy"
                  />
                ) : (
                  <span className="bt">{b.title}</span>
                )}
              </div>
              <span className="bkt">{b.title}</span>
              <span className="cap tnum">
                {b.priceKrw.toLocaleString("ko-KR")}원
              </span>
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

// ── 바배너 ──────────────────────────────────────────────────────────────
export function BarBannerModule({
  config,
}: {
  config: Record<string, unknown>;
}) {
  const c = barBannerConfigSchema.parse(config);
  if (!c.imagePc && !c.imageMobile) return null;
  // 모바일 이미지를 따로 주면 폭에 따라 갈아 끼운다(둘 중 하나만 있으면 그걸 공용).
  const pc = c.imagePc || c.imageMobile;
  const mobile = c.imageMobile || c.imagePc;
  const img = (
    <picture>
      <source media="(max-width: 767px)" srcSet={mobile} />
      <img
        src={pc}
        alt={c.alt}
        loading="lazy"
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </picture>
  );
  return (
    <section className="btier">
      <div className="wrap">
        {c.href ? (
          <Link to={c.href} className="bt-imglink">
            {img}
          </Link>
        ) : (
          img
        )}
      </div>
    </section>
  );
}

// ── 일반페이지 영역 ─────────────────────────────────────────────────────
export function FreeHtmlModule({
  config,
}: {
  config: Record<string, unknown>;
}) {
  const c = freeHtmlConfigSchema.parse(config);
  if (!c.html.trim()) return null;
  return (
    <section className="band">
      <div className="wrap">
        {/* 운영자(staff) 작성 신뢰 HTML — RichHtml 이 script 를 정확히 한 번 실행한다. */}
        <RichHtml className="lecture-detail-html" html={c.html} />
      </div>
    </section>
  );
}
