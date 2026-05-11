// /api/search?q=... — Command Palette 전역 검색.
// 빈 검색어 / 1자 미만은 빈 결과. 로그인 안 한 경우도 동작(메모/즐겨찾기는 빠짐).

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { runGlobalSearch } from "~/features/search/queries.server";

import type { Route } from "./+types/search";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  const results = await runGlobalSearch(client, user?.id ?? null, q);
  return data(results);
}
