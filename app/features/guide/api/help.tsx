// 화면 안 "?" 도움 버튼 데이터 — ?key=<screenKey> 로 해당 화면의 발행 가이드를 반환.
import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { listGuidesByScreenKey } from "~/features/guide/queries.server";

import type { Route } from "./+types/help";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ guides: [] }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  if (!key || key.length > 60) return data({ guides: [] });
  const guides = await listGuidesByScreenKey(client, key);
  return data({
    guides: guides.map((g) => ({
      guideId: g.guideId,
      title: g.title,
      category: g.category,
      bodyMd: g.bodyMd,
      youtubeUrl: g.youtubeUrl,
    })),
  });
}
