// 학습과목 허브 — 트리 필터(중요도/즐겨찾기) 매칭 조문 본문 페이지 로드.
// FilteredArticlesReader 가 20개씩 호출한다.
import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getArticlesByTreeFilter } from "~/features/laws/queries.server";

import type { Route } from "./+types/filtered-articles";

const PAGE_SIZE = 20;

const schema = z.object({
  law: z.string().min(1).max(30),
  imp: z.coerce.number().int().min(0).max(3),
  bm: z.coerce.number().int().min(0).max(5),
  offset: z.coerce.number().int().min(0),
});

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const parsed = schema.safeParse({
    law: sp.get("law"),
    imp: sp.get("imp") ?? "0",
    bm: sp.get("bm") ?? "0",
    offset: sp.get("offset") ?? "0",
  });
  if (!parsed.success) return data({ error: "Invalid input" }, { status: 400 });
  const { law, imp, bm, offset } = parsed.data;
  if (imp === 0 && bm === 0) {
    return data({ error: "No filter" }, { status: 400 });
  }

  const { total, items } = await getArticlesByTreeFilter(client, law, {
    importanceMin: imp,
    bookmarkMin: bm,
    userId: user.id,
    offset,
    limit: PAGE_SIZE,
  });
  return data({ total, items, pageSize: PAGE_SIZE });
}
