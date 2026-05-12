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

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  const results = await runGlobalSearch(client, user?.id ?? null, q);

  let recentSearches: RecentSearch[] = [];
  if (user) {
    if (q.trim().length === 0) {
      recentSearches = await listRecentSearches(client, user.id);
    } else if (q.trim().length >= 2) {
      // 의미 있는 검색만 기록. 응답 전 await 하지 않음.
      void recordSearchQuery(client, user.id, q);
    }
  }

  return data({ ...results, recentSearches });
}
