// feat-9-003 검증용 — hybridSearch + answerQuestion 스트리밍을 SSE 로 흘리는 staff 전용 endpoint.
//
// 호출: GET /api/ai-qna/answer-debug?q=<질문>&topK=12&lawCodes=patent
//   - text/event-stream 응답
//   - 이벤트 순서:
//       data: {"type":"search", parsed, perPathCounts, hits:[{label,sourceType,...}]}
//       data: {"type":"text", "delta":"..."}    (반복)
//       data: {"type":"done", "fullText":..., "citations":[...], "tokenUsage":{...}}
//       data: {"type":"error", "message":"..."} (필요시)
//
// feat-9-004 채팅 UI 가 도입되기 전 답변·인용 정합성을 점검하는 dev 용. 권한: staff only.

import makeServerClient from "~/core/lib/supa-client.server";
import { answerQuestion } from "~/features/ai-qna/lib/answer.server";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import { getStaffRole } from "~/features/laws/queries.server";

import type { Route } from "./+types/answer-debug";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const role = await getStaffRole(client, user.id);
  if (!role) return new Response("Forbidden — staff only", { status: 403 });

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) {
    return new Response(
      JSON.stringify({
        usage:
          "GET /api/ai-qna/answer-debug?q=<질문>&topK=12&lawCodes=patent (text/event-stream)",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  const topK = Math.max(
    1,
    Math.min(20, Number(url.searchParams.get("topK") ?? 12)),
  );
  const lawCodes = (url.searchParams.get("lawCodes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };
      try {
        // 1) 하이브리드 검색 — 결과 메타를 먼저 흘려 클라이언트가 출처 카드 골격을 띄울 수 있게.
        const search = await hybridSearch(client, q, {
          topK,
          lawCodesOverride: lawCodes.length > 0 ? lawCodes : undefined,
        });
        send({
          type: "search",
          parsed: search.parsed,
          semanticAvailable: search.semanticAvailable,
          perPathCounts: search.perPathCounts,
          hits: search.hits.map((h, i) => ({
            label: i + 1,
            chunkId: h.chunkId,
            sourceType: h.sourceType,
            sourceId: h.sourceId,
            headingPath: h.headingPath,
            rrfScore: h.rrfScore,
            pathScores: h.pathScores,
          })),
        });

        // 2) Claude 스트리밍.
        for await (const ev of answerQuestion(q, search.hits)) {
          send(ev);
          if (ev.type === "done" || ev.type === "error") break;
        }
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // 일부 프록시(nginx)가 버퍼링 → Vercel 은 영향 없으나 안전.
      "X-Accel-Buffering": "no",
    },
  });
}
