// feat-12 리담소식 상세 — /lecture/news/:newsId. 공개. 운영자 작성이라 마크다운 렌더(trusted).
import { Link, data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { MarkdownView } from "~/features/problems/components/markdown-view";

import { LandingStyle } from "../components/landing-style";
import { newsKindChipClass, newsKindLabel } from "../labels";
import { getNews } from "../queries.server";

import type { Route } from "./+types/news-detail";

export function meta({ data: d }: Route.MetaArgs) {
  return [{ title: `${d?.news.title ?? "리담소식"} | 리담변리사학원` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const news = params.newsId ? await getNews(client, params.newsId) : null;
  if (!news) throw data("소식을 찾을 수 없습니다", { status: 404 });
  return { news };
}

export default function NewsDetail({ loaderData }: Route.ComponentProps) {
  const { news } = loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <section className="band">
        <div className="wrap" style={{ maxWidth: 820 }}>
          <Link className="more" to="/lecture/news">
            ← 리담소식
          </Link>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span className={`chip ${newsKindChipClass(news.kind)}`}>
              {newsKindLabel(news.kind)}
            </span>
            <span className="tnum" style={{ color: "var(--faint)", fontSize: 13 }}>
              {news.published_at.slice(0, 10).replace(/-/g, ".")}
            </span>
          </div>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 900,
              letterSpacing: "-.03em",
              margin: "12px 0 20px",
              lineHeight: 1.25,
            }}
          >
            {news.title}
          </h2>
          {news.body_md ? (
            <div style={{ color: "var(--soft)", fontSize: 15, lineHeight: 1.85 }}>
              <MarkdownView text={news.body_md} trusted />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
