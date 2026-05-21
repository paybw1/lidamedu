// feat-9-005 v1.2 — eval 자동 평가 cron.
// 호출: 외부 cron / Vercel cron / 운영자 즉시 트리거. CRON_SECRET 검증.
//
// 쿼리: limit=N (default 10). active eval_items 중 last run 가장 오래된 N 개.
// ANTHROPIC_API_KEY / VOYAGE_API_KEY 둘 다 필요. 키 누락 시 dry-run (선택 id 만 보고).

import { data } from "react-router";

import {
  pickEvalItemsToRun,
  runSingleEval,
} from "~/features/ai-qna/lib/eval-runner.server";

import type { Route } from "./+types/ai-eval-run";

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
  const url = new URL(request.url);
  const limit = Math.max(
    1,
    Math.min(50, Number(url.searchParams.get("limit") ?? 10)),
  );

  if (!process.env.ANTHROPIC_API_KEY || !process.env.VOYAGE_API_KEY) {
    const picked = await pickEvalItemsToRun(limit);
    return data({
      ok: true,
      mode: "dry-run",
      reason: "ANTHROPIC_API_KEY 또는 VOYAGE_API_KEY 미설정",
      picked: picked.length,
      ids: picked,
    });
  }

  const ids = await pickEvalItemsToRun(limit);
  if (ids.length === 0) {
    return data({ ok: true, mode: "live", picked: 0, results: [] });
  }

  const results: Array<{
    evalItemId: string;
    ok: boolean;
    runId?: string;
    score?: number;
    verdict?: string;
    error?: string;
  }> = [];
  for (const id of ids) {
    try {
      const r = await runSingleEval(id);
      results.push({
        evalItemId: id,
        ok: true,
        runId: r.runId,
        score: r.score,
        verdict: r.verdict,
      });
    } catch (e) {
      results.push({
        evalItemId: id,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return data({ ok: true, mode: "live", picked: ids.length, results });
}

export async function loader({ request }: Route.LoaderArgs) {
  return run(request);
}
export async function action({ request }: Route.ActionArgs) {
  return run(request);
}
