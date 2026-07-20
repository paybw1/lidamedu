// 사용자의 검색 히스토리 전부 삭제.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { clearSearchHistory } from "~/features/search/queries.server";

import type { Route } from "./+types/clear-history";

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return data({ error: "Method not allowed" }, { status: 405 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  await clearSearchHistory(client, user.id);
  return data({ ok: true });
}

// GET(브라우저 직접 접근) — loader 부재 시 React Router 500. POST 전용 안내(405).
export { postOnlyLoader as loader } from "~/core/lib/api-post-only";
