// feat-12 리담소식 목록 — /lecture/news. 공개. 고정→최신순.
import { Link } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";

import { LandingStyle } from "../components/landing-style";
import { newsKindChipClass, newsKindLabel } from "../labels";
import { listNews } from "../queries.server";

import type { Route } from "./+types/news";
import { pageMeta } from "~/core/lib/seo";

export const meta: Route.MetaFunction = (a) =>
  pageMeta(
    {
      title: "리담소식",
      description:
        "리담변리사학원 공지와 소식 — 개강·시험 일정 안내, 학원 소식을 전합니다.",
    },
    a,
  );

// 분류 탭 — 값은 labels.ts 의 NEWS_KIND_LABEL 과 같은 코드를 쓴다(라벨을 새로 짜지 않는다).
const KIND_TABS: ReadonlyArray<{ value: string | null; label: string }> = [
  { value: null, label: "전체" },
  { value: "notice", label: "공지" },
  { value: "event", label: "이벤트" },
  { value: "passer", label: "합격속보" },
];

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  // ★쿼리는 이미 kind 를 받는다(queries.server listNews). 화면이 쓰지 않고 있었을 뿐이다.
  const kind = new URL(request.url).searchParams.get("kind");
  const valid = KIND_TABS.some((t) => t.value === kind) ? kind : null;
  const news = await listNews(client, { kind: valid });
  return { news, kind: valid };
}

export default function News({ loaderData }: Route.ComponentProps) {
  const { news, kind } = loaderData;
  return (
    <div className="llx">
      <LandingStyle />
      <section className="band">
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div className="shead">
            <div>
              <p className="eyebrow">리담소식</p>
              <h2>공지 · 이벤트</h2>
            </div>
          </div>
          {/* 분류 탭 — 비로그인 방문자가 "공지"만 골라 볼 수 있는 유일한 경로다
              (개인 수신함인 /lecture/announcements 는 로그인 전용). */}
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 14px" }}
          >
            {KIND_TABS.map((t) => (
              <Link
                key={t.label}
                to={t.value ? `/lecture/news?kind=${t.value}` : "/lecture/news"}
                className={`btn sm ${t.value === kind ? "primary" : "ghost"}`}
                aria-current={t.value === kind ? "page" : undefined}
              >
                {t.label}
              </Link>
            ))}
          </div>
          {news.length === 0 ? (
            <p style={{ color: "var(--soft)", fontSize: 14 }}>
              {kind ? "이 분류의 소식이 아직 없습니다." : "등록된 소식이 없습니다."}
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
                  <span className="nt">
                    {it.pinned ? "📌 " : ""}
                    {it.title}
                  </span>
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
