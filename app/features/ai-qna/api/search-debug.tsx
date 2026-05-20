// feat-9-002 검증용 — hybridSearch 결과를 JSON 으로 보여주는 staff 전용 endpoint.
// 답변 생성(feat-9-003) 전에 4 경로 + RRF 결과를 점검할 수 있게 한다.
//
// 호출: GET /api/ai-qna/search-debug?q=<질문>&topK=12&perPathK=20
// 권한: staff(instructor/admin) 만. 일반 사용자는 403.

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/search-debug";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return data({ error: "Unauthorized" }, { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return data({ error: "Forbidden — staff only" }, { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return data(
      {
        usage:
          "GET /api/ai-qna/search-debug?q=<질문>&topK=12&perPathK=20&lawCodes=patent,trademark",
        example: "?q=특허법 제29조 진보성 판단 기준",
      },
      { status: 400 },
    );
  }

  const topK = Math.max(
    1,
    Math.min(50, Number(url.searchParams.get("topK") ?? 12)),
  );
  const perPathK = Math.max(
    1,
    Math.min(100, Number(url.searchParams.get("perPathK") ?? 20)),
  );
  const lawCodes = (url.searchParams.get("lawCodes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const result = await hybridSearch(client, q, {
    topK,
    perPathK,
    lawCodesOverride: lawCodes.length > 0 ? lawCodes : undefined,
  });

  // body_text 는 너무 길어 JSON 응답 부풀림 — 미리보기만.
  const hits = result.hits.map((h) => ({
    chunkId: h.chunkId,
    sourceType: h.sourceType,
    sourceId: h.sourceId,
    chunkIndex: h.chunkIndex,
    lawCode: h.lawCode,
    headingPath: h.headingPath,
    bodySnippet:
      h.bodyText.length > 240 ? h.bodyText.slice(0, 240) + "…" : h.bodyText,
    rrfScore: h.rrfScore,
    pathScores: h.pathScores,
  }));

  return data({
    ok: true,
    question: q,
    parsed: result.parsed,
    semanticAvailable: result.semanticAvailable,
    perPathCounts: result.perPathCounts,
    hits,
  });
}
