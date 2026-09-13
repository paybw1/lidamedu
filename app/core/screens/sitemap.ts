// /sitemap.xml — 검색엔진에게 "색인할 주소 목록"을 준다 (feat-11-012 P1).
//
// ★2026-09-13 이전 상태: 총 7건(법정문서 4 + "/" + /login + /join)이고 그 7건이 전부
//   `https://www.lidamipedu.com//legal/...` 처럼 슬래시가 둘이었다. 강의 경로는 0건.
//   즉 강의 플랫폼은 검색엔진에 존재하지 않았다.
//
// ★강의 경로는 **게이트가 열릴 때 함께** 실린다(LECTURE_GATE_STAGE). 게이트가 닫힌 채로
//   주소를 실으면 크롤러가 받는 것은 내용이 아니라 운영 사이트로의 리다이렉트뿐이고,
//   그건 색인에 해가 된다. 게이트를 여는 상수 하나가 사이트맵도 같이 연다.
//
// ★공개 기준은 화면이 쓰는 쿼리를 그대로 재사용한다 — 사이트맵과 화면이 서로 다른 기준을
//   갖는 순간 "검색에는 떴는데 열면 404" 가 난다.
//
// ★프리렌더 대상이 아니다(react-router.config.ts) — 빌드 시점에 고정되면 새 강의·소식이
//   다음 배포 전까지 색인되지 않는다. 대신 CDN 캐시로 매 요청 DB 왕복을 막는다.
import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  CANONICAL_ORIGIN,
  LECTURE_GATE_STAGE,
  PUBLIC_LECTURE_PATHS,
} from "~/core/lib/platforms";
import { buildSitemapXml, type SitemapEntry } from "~/core/lib/sitemap";
import makeServerClient from "~/core/lib/supa-client.server";
import { listBookstoreBooks } from "~/features/bookstore/queries.server";
import { listInstructors } from "~/features/instructors/queries.server";
import { listNews, listSchedules } from "~/features/landing/queries.server";
import { listSellableLectureProducts } from "~/features/lms/queries.server";

import type { Route } from "./+types/sitemap";

/** 없는 디렉토리를 안전하게 스캔 — 없으면 빈 목록(프리렌더 500 방지). */
async function scanMdxSlugs(...segments: string[]): Promise<string[]> {
  try {
    return (await readdir(path.join(process.cwd(), ...segments)))
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => file.replace(".mdx", ""));
  } catch {
    return [];
  }
}

/**
 * 강의 플랫폼 항목 — 게이트가 열린 뒤에만 채운다.
 * 실패해도 사이트맵 전체를 죽이지 않는다(정적 항목만이라도 나가는 편이 낫다).
 */
async function lectureEntries(request: Request): Promise<SitemapEntry[]> {
  if (LECTURE_GATE_STAGE === "closed") return [];
  const [client] = makeServerClient(request);

  const [products, books, news, schedules, instructors] = await Promise.all([
    listSellableLectureProducts(client, null).catch(() => []),
    listBookstoreBooks(client).catch(() => []),
    listNews(client).catch(() => []),
    listSchedules(client).catch(() => []),
    listInstructors(client).catch(() => []),
  ]);

  return [
    // 공개 화면 목록 — 게이트·robots 와 같은 단일 소스.
    ...PUBLIC_LECTURE_PATHS.map((p) => ({ path: p })),
    ...products.map((p) => ({ path: `/lecture/catalog/${p.code}` })),
    ...books.map((b) => ({ path: `/lecture/books/${b.bookId}` })),
    ...news.map((n) => ({
      path: `/lecture/news/${n.news_id}`,
      lastmod: n.updated_at ?? n.published_at,
    })),
    ...schedules.map((s) => ({
      path: `/lecture/schedule/${s.schedule_id}`,
      lastmod: s.updated_at,
    })),
    ...instructors.map((i) => ({ path: `/about/instructors/${i.slug}` })),
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const legalUrls = (await scanMdxSlugs("app", "features", "legal", "docs")).map(
    (slug) => ({ path: `/legal/${slug}` }),
  );

  const entries: SitemapEntry[] = [
    { path: "/" },
    ...legalUrls,
    // ★/login·/join 은 싣지 않는다 — 검색 결과에 로그인 화면이 뜰 이유가 없다(robots 에서도 차단).
    ...(await lectureEntries(request)),
  ];

  return new Response(buildSitemapXml(CANONICAL_ORIGIN, entries), {
    headers: {
      "Content-Type": "application/xml",
      // 크롤러가 반복 호출해도 DB 를 다시 치지 않게. 새 소식·강의는 최대 1시간 뒤 반영.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
