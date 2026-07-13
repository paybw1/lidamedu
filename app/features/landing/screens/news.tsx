// feat-12 리담소식 목록 — /lecture/news. 공개. 고정→최신순.
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import { newsKindChipClass, newsKindLabel } from "../labels";
import { listNews } from "../queries.server";

import type { Route } from "./+types/news";

export function meta() {
  return [{ title: "리담소식 | 리담변리사학원" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const news = await listNews(client);
  return { news };
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { news } = loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <section className="band">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">리담소식</p>
              <h2>공지 · 이벤트 · 합격 속보</h2>
            </div>
          </div>
          {news.length === 0 ? (
            <p style={{ color: "var(--soft)", fontSize: 14 }}>
              등록된 소식이 없습니다.
            </p>
          ) : (
            <div className="newslist">
              {news.map((it) => (
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
                    {it.published_at.slice(0, 10).replace(/-/g, ".")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
