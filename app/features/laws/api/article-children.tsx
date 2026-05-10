// 조문 트리 lazy-load — 부모의 직속 자식 노드만 반환.
// 큰 법령(민법 등)에서 초기 skeleton 을 가볍게 로드한 뒤,
// 사용자가 펼친 노드의 자식을 on-demand 로 가져올 때 사용.

import { data } from "react-router";
import { z } from "zod";

import makeServerClient from "~/core/lib/supa-client.server";
import { getArticleChildren } from "~/features/laws/queries.server";

import type { Route } from "./+types/article-children";

const querySchema = z.object({
  lawId: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
});

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    lawId: url.searchParams.get("lawId"),
    parentId: url.searchParams.get("parentId") || null,
  });
  if (!parsed.success) {
    return data({ error: "Invalid params" }, { status: 400 });
  }
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });

  const children = await getArticleChildren(
    client,
    parsed.data.lawId,
    parsed.data.parentId,
  );
  return data({ children });
}
