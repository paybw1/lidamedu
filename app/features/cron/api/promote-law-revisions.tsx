// 시행일 도래 개정 자동 현행 전환 cron (feat-7-004).
// 외부/Vercel cron 일별 호출 → promote_effective_revisions() RPC 가 effective_date<=오늘 이면서
// 아직 현행이 아닌 스냅샷을 현행으로 스왑 + 직전본 expired_date 마감.
// 스왑된 조문은 RAG 청크 재인덱싱.

import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";
import { reindexArticles } from "~/features/ai-qna/lib/source-chunker.server";

import type { Route } from "./+types/promote-law-revisions";

function checkAuth(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === expected) return true;
  const header = request.headers.get("authorization") ?? "";
  if (header === `Bearer ${expected}`) return true;
  return false;
}

async function run(request: Request) {
  if (!checkAuth(request)) {
    return data({ error: "Forbidden" }, { status: 403 });
  }
  const { data: swapped, error } = await adminClient.rpc(
    "promote_effective_revisions",
  );
  if (error) {
    return data({ error: error.message }, { status: 500 });
  }
  const articleIds = (swapped ?? []).filter(
    (x): x is string => typeof x === "string",
  );
  if (articleIds.length > 0) {
    await reindexArticles(articleIds);
  }
  return data({ ok: true, promoted: articleIds.length });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
