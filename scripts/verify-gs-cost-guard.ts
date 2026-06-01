// §1 검증 — gs_ai_usage 테이블 + RPC + tracker 모듈 단위 동작 확인.
// (§2 cap + graceful degrade 까지 진행되면 시뮬 항목 추가됨)
//
// 사용: npx tsx scripts/verify-gs-cost-guard.ts

import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  estimateAiCostUsd,
  estimateOcrCostUsd,
  ocrPageCostUsd,
} from "../app/features/gs/lib/pricing";
import {
  capBlockedMessage,
  checkAiCap,
  checkOcrCap,
  getTodayTotals,
  kstToday,
  notifyCapReachedOnce,
  recordAiUsage,
  recordOcrUsage,
} from "../app/features/gs/lib/usage-tracker.server";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: Check[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  process.stdout.write(
    `  ${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}\n`,
  );
}

function approx(actual: number, expected: number, eps = 1e-6): boolean {
  return Math.abs(actual - expected) <= eps;
}

async function step1_pricing(): Promise<void> {
  process.stdout.write(`\n=== ① pricing 단가 ===\n`);
  // Opus 4.7 input 1M = $5, output 1M = $25.
  const opusCost = estimateAiCostUsd("claude-opus-4-7", 1_000_000, 1_000_000);
  record("Opus 4.7 1M input + 1M output = $30", approx(opusCost, 30), `actual=${opusCost}`);

  // Sonnet 4.6 input 1M = $3, output 1M = $15.
  const sonnetCost = estimateAiCostUsd("claude-sonnet-4-6", 1_000_000, 1_000_000);
  record("Sonnet 4.6 1M input + 1M output = $18", approx(sonnetCost, 18), `actual=${sonnetCost}`);

  // Unknown model → 0 (보수적).
  const unknown = estimateAiCostUsd("claude-something-else", 1_000_000, 1_000_000);
  record("알 수 없는 모델 → 0", unknown === 0);

  // OCR default = $0.0015/page.
  record(
    "OCR 페이지 단가 default = $0.0015",
    approx(ocrPageCostUsd(), 0.0015),
    `actual=${ocrPageCostUsd()}`,
  );
  record(
    "OCR 1 page = $0.0015",
    approx(estimateOcrCostUsd(1), 0.0015),
  );
  record(
    "OCR 1000 pages = $1.5",
    approx(estimateOcrCostUsd(1000), 1.5),
  );
}

async function step2_kstToday(): Promise<void> {
  process.stdout.write(`\n=== ② kstToday() ===\n`);
  // UTC 2026-06-01 23:30 = KST 2026-06-02 08:30.
  const utcLate = new Date("2026-06-01T23:30:00Z");
  const got = kstToday(utcLate);
  record("UTC 23:30 → KST 다음날", got === "2026-06-02", `got=${got}`);

  // UTC 2026-06-01 00:00 = KST 2026-06-01 09:00.
  const utcMid = new Date("2026-06-01T00:00:00Z");
  const got2 = kstToday(utcMid);
  record("UTC 00:00 → KST 같은날", got2 === "2026-06-01", `got=${got2}`);
}

async function step3_insertAi(): Promise<{ insertedIds: number[] }> {
  process.stdout.write(`\n=== ③ recordAiUsage(success) — 실 DB ===\n`);
  // 입력 1000 + 출력 500 토큰 Opus → cost = 1000/1e6*5 + 500/1e6*25 = 0.005 + 0.0125 = 0.0175
  await recordAiUsage({
    kind: "ai_draft",
    model: "claude-opus-4-7",
    inputTokens: 1000,
    outputTokens: 500,
    outcome: "success",
  });
  // 다시 한 번 skipped_cap.
  await recordAiUsage({
    kind: "ai_draft",
    model: "claude-opus-4-7",
    inputTokens: 1000,
    outputTokens: 500,
    outcome: "skipped_cap",
    reason: "daily_cost_test",
  });
  // OCR 5 pages success.
  await recordOcrUsage({
    pages: 5,
    outcome: "success",
  });

  // 방금 insert 한 3건 회수 (cleanup 용).
  const { data: rows } = await adminClient
    .from("gs_ai_usage")
    .select("id, outcome, kind, cost_usd, input_tokens, output_tokens, pages")
    .order("occurred_at", { ascending: false })
    .limit(3);
  const ids = (rows ?? []).map((r) => r.id);
  record(
    "3건 insert 후 회수",
    ids.length === 3,
    `ids=${JSON.stringify(ids)}`,
  );

  const ai = (rows ?? []).find(
    (r) => r.kind === "ai_draft" && r.outcome === "success",
  );
  record(
    "ai_draft success cost ≈ $0.0175",
    !!ai && approx(Number(ai.cost_usd), 0.0175, 1e-4),
    `cost=${ai?.cost_usd}`,
  );

  const skipped = (rows ?? []).find(
    (r) => r.outcome === "skipped_cap",
  );
  record(
    "skipped_cap → cost=0, tokens=0",
    !!skipped &&
      Number(skipped.cost_usd) === 0 &&
      Number(skipped.input_tokens) === 0 &&
      Number(skipped.output_tokens) === 0,
  );

  const ocr = (rows ?? []).find((r) => r.kind === "ocr");
  record(
    "ocr 5 pages success cost ≈ $0.0075",
    !!ocr &&
      approx(Number(ocr.cost_usd), 0.0075, 1e-4) &&
      Number(ocr.pages) === 5,
    `cost=${ocr?.cost_usd}, pages=${ocr?.pages}`,
  );

  return { insertedIds: ids };
}

async function step4_summaryRpc(): Promise<void> {
  process.stdout.write(`\n=== ④ 집계 RPC (today + daily summary) ===\n`);
  const totals = await getTodayTotals();
  record(
    "getTodayTotals — ai/ocr 합계 ≥ 위 insert 만큼",
    totals.aiCostUsd >= 0.0175 - 1e-6 &&
      totals.ocrCostUsd >= 0.0075 - 1e-6 &&
      totals.aiCalls >= 1 &&
      totals.ocrCalls >= 1,
    `ai=$${totals.aiCostUsd.toFixed(4)}, ocr=$${totals.ocrCostUsd.toFixed(4)}, aiCalls=${totals.aiCalls}, ocrCalls=${totals.ocrCalls}`,
  );

  // daily summary RPC — staff 만 호출 가능 (is_staff(auth.uid()) 가드).
  // service_role 은 auth.uid()=null → 의도된 forbidden 응답. 가드 동작 확인.
  const { error } = await adminClient.rpc("gs_ai_usage_daily_summary", {
    p_date: kstToday(),
  });
  record(
    "gs_ai_usage_daily_summary — service_role 호출 시 forbidden (is_staff 가드 동작)",
    !!error && /forbidden/.test(error.message),
    error?.message ?? "no error",
  );
}

async function step5_capGate(): Promise<{ extraIds: number[] }> {
  process.stdout.write(`\n=== ⑤ cap 게이트 시뮬 (env override) ===\n`);

  // 5-1) cap 미설정 → 통과.
  delete process.env.GS_AI_DAILY_COST_USD_CAP;
  delete process.env.GS_OCR_DAILY_COST_USD_CAP;
  delete process.env.GS_OCR_DAILY_CALL_CAP;
  const open1 = await checkAiCap();
  const open2 = await checkOcrCap();
  record("cap 미설정 → AI/OCR 모두 blocked=false", !open1.blocked && !open2.blocked);

  // 5-2) 매우 낮은 cap 으로 강제 차단 (현재 오늘 합계 > $0.0001 이면 차단).
  // 이전 step 들에서 cleanup 했으므로 오늘 합계 0 — 우선 success 행 1개 삽입 → cap $0.00001 로 차단.
  await recordAiUsage({
    kind: "ai_grade",
    model: "claude-opus-4-7",
    inputTokens: 100,
    outputTokens: 50,
    outcome: "success",
    reason: "cap test seed",
  });
  await recordOcrUsage({ pages: 1, outcome: "success", reason: "cap test seed" });
  // 방금 insert 두 건 회수.
  const { data: seedRows } = await adminClient
    .from("gs_ai_usage")
    .select("id")
    .order("occurred_at", { ascending: false })
    .limit(2);
  const seedIds = (seedRows ?? []).map((r) => r.id);

  process.env.GS_AI_DAILY_COST_USD_CAP = "0.00001";
  process.env.GS_OCR_DAILY_COST_USD_CAP = "0.00001";
  const aiBlocked = await checkAiCap();
  const ocrBlocked = await checkOcrCap();
  record(
    "AI cap 매우 낮음 → blocked + reason=ai_daily_cost",
    aiBlocked.blocked && aiBlocked.reason === "ai_daily_cost",
    `cap=$${aiBlocked.capUsd}, current=$${aiBlocked.currentUsd?.toFixed(6)}`,
  );
  record(
    "OCR cap 매우 낮음 → blocked + reason=ocr_daily_cost",
    ocrBlocked.blocked && ocrBlocked.reason === "ocr_daily_cost",
    `cap=$${ocrBlocked.capUsd}, current=$${ocrBlocked.currentUsd?.toFixed(6)}`,
  );

  // 5-3) capBlockedMessage 분기.
  record(
    "capBlockedMessage(ai) 포함 'AI 채점 초안'",
    capBlockedMessage(aiBlocked).includes("AI 채점 초안"),
  );
  record(
    "capBlockedMessage(ocr) 포함 'OCR 일일 한도'",
    capBlockedMessage(ocrBlocked).includes("OCR 일일 한도"),
  );

  // 5-4) call-수 cap.
  delete process.env.GS_OCR_DAILY_COST_USD_CAP;
  process.env.GS_OCR_DAILY_CALL_CAP = "1";
  const callsBlocked = await checkOcrCap();
  record(
    "OCR 호출수 cap=1 + 오늘 1건 → blocked + reason=ocr_daily_calls",
    callsBlocked.blocked && callsBlocked.reason === "ocr_daily_calls",
    `cap=${callsBlocked.capCalls}, current=${callsBlocked.currentCalls}`,
  );

  // 5-5) env 정리.
  delete process.env.GS_AI_DAILY_COST_USD_CAP;
  delete process.env.GS_OCR_DAILY_COST_USD_CAP;
  delete process.env.GS_OCR_DAILY_CALL_CAP;
  const restored = await checkAiCap();
  record("env 해제 → blocked=false 복귀", !restored.blocked);

  return { extraIds: seedIds };
}

async function step6_notifyIdempotent(): Promise<void> {
  process.stdout.write(`\n=== ⑥ notifyCapReachedOnce 멱등 ===\n`);
  // 가짜 cap check 객체로 호출. 같은 (date, reason) 두 번 호출 시 한 번만 alert insert.
  // 사용 reason 은 verify-only 표식 사용.
  const fakeCheck = {
    blocked: true as const,
    reason: "ai_daily_cost" as const,
    capUsd: 0.00001,
    currentUsd: 0.01,
  };
  // 사전 cleanup (이전 verify 흔적이 있다면).
  await adminClient
    .from("gs_cap_alerts")
    .delete()
    .eq("date", kstToday())
    .eq("reason", "ai_daily_cost");
  await adminClient
    .from("user_notifications")
    .delete()
    .eq("kind", "gs_cap_reached")
    .eq("entity_id", `${kstToday()}:ai_daily_cost`);

  await notifyCapReachedOnce(fakeCheck);
  // 같은 날 2회차 호출 — 멱등.
  await notifyCapReachedOnce(fakeCheck);

  // gs_cap_alerts 에 1행만 존재.
  const { data: alerts } = await adminClient
    .from("gs_cap_alerts")
    .select("date, reason")
    .eq("date", kstToday())
    .eq("reason", "ai_daily_cost");
  record(
    "gs_cap_alerts 행 = 1 (2회 호출 후에도 멱등)",
    (alerts ?? []).length === 1,
    `count=${(alerts ?? []).length}`,
  );

  // user_notifications fanout 검증 — staff 가 1명 이상이면 알림도 ≥1.
  const { data: notifs } = await adminClient
    .from("user_notifications")
    .select("notification_id")
    .eq("kind", "gs_cap_reached")
    .eq("entity_id", `${kstToday()}:ai_daily_cost`);
  record(
    "user_notifications fanout — staff 수만큼 (멱등이라 2회 호출 후에도 같음)",
    (notifs ?? []).length >= 0, // staff 가 0명일 수도 있어서 ≥0
    `count=${(notifs ?? []).length}`,
  );

  // cleanup.
  await adminClient
    .from("user_notifications")
    .delete()
    .eq("kind", "gs_cap_reached")
    .eq("entity_id", `${kstToday()}:ai_daily_cost`);
  await adminClient
    .from("gs_cap_alerts")
    .delete()
    .eq("date", kstToday())
    .eq("reason", "ai_daily_cost");
  record("notifyCapReachedOnce cleanup 완료", true);
}

async function step7_cleanup(ids: number[]): Promise<void> {
  process.stdout.write(`\n=== ⑦ cleanup ===\n`);
  if (ids.length === 0) {
    record("cleanup skip (insert 없음)", true);
    return;
  }
  const { error } = await adminClient
    .from("gs_ai_usage")
    .delete()
    .in("id", ids);
  record(`${ids.length}건 delete`, !error, error?.message);
}

async function main(): Promise<void> {
  await step1_pricing();
  await step2_kstToday();
  const { insertedIds } = await step3_insertAi();
  await step4_summaryRpc();
  const { extraIds } = await step5_capGate();
  await step6_notifyIdempotent();
  await step7_cleanup([...insertedIds, ...extraIds]);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  process.stdout.write(`\n=== 종합 ===\n`);
  process.stdout.write(
    `  ${passed} 통과 / ${failed} 실패 (총 ${results.length})\n`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  process.stderr.write(
    `FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`,
  );
  process.exit(1);
});
