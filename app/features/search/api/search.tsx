// /api/search?q=... — Command Palette 전역 검색.
// 빈 검색어 / 1자 미만은 빈 결과 + 최근 검색어 추천.
// 의미 있는 검색이면 user_search_history 에 기록 (best-effort).

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import {
  listRecentSearches,
  recordSearchQuery,
  runGlobalSearch,
  type RecentSearch,
} from "~/features/search/queries.server";

import type { Route } from "./+types/search";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  // 검색 범위 — title(제목·라벨) / full(본문 전체). 기본 title.
  const scope = url.searchParams.get("scope") === "full" ? "full" : "title";

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  let results = await runGlobalSearch(client, user?.id ?? null, q, scope);
  // 제목 검색이 0건이면 본문 전체로 자동 재검색 — 본문 문구("구성요소가 독립하여" 등)를
  //   토글을 몰라 못 찾는 문제 구제. autoFull 로 UI 가 "본문 전체에서 찾음" 안내.
  let autoFull = false;
  if (scope === "title" && q.trim().length >= 2) {
    const total =
      results.articles.length +
      results.cases.length +
      results.problems.length +
      results.qna.length +
      results.memos.length +
      results.bookmarks.length;
    if (total === 0) {
      results = await runGlobalSearch(client, user?.id ?? null, q, "full");
      autoFull = true;
    }
  }

  let recentSearches: RecentSearch[] = [];
  if (user) {
    if (q.trim().length === 0) {
      recentSearches = await listRecentSearches(client, user.id);
    } else if (q.trim().length >= 2) {
      // 의미 있는 검색만 기록. 응답 전 await 하지 않음.
      void recordSearchQuery(client, user.id, q);
    }
  }

  return data({ ...results, recentSearches, autoFull });
}
