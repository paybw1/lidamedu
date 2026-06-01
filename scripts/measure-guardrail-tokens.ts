// v9 후속 — 가드레일 토큰 측정. 캐싱 회생 판정용.
//
// 측정 대상:
//   (1) 가드레일 only (컨텍스트 빈 상태) — buildSystemPrompt([])
//   (2) 가드레일 + 컨텍스트 12청크 (typical) — 실제 hybridSearch top-12
//
// 판정:
//   가드레일이 Sonnet 4.6 최소 캐시 prefix 2048 토큰 ≥ → 분리 캐싱 회생 가능 (v9-A 재설계 후보)
//   < 2048 → 캐싱 폐기 (가드레일을 억지로 늘리는 건 본말전도)

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

import adminClient from "../app/core/lib/supa-admin-client.server";
import { AI_QNA_MODEL } from "../app/features/ai-qna/lib/constants";
import { hybridSearch } from "../app/features/ai-qna/lib/hybrid-search.server";
import { buildContextItems, buildSystemPrompt } from "../app/features/ai-qna/lib/system-prompt";

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  // (1) 가드레일 only
  const guardOnly = buildSystemPrompt([]);
  process.stdout.write(`\n=== (1) 가드레일 only (컨텍스트 빈) ===\n`);
  process.stdout.write(`문자 수: ${guardOnly.length}\n`);
  const t1 = await client.messages.countTokens({
    model: AI_QNA_MODEL,
    system: guardOnly,
    messages: [{ role: "user", content: "x" }],
  });
  process.stdout.write(`토큰 수: ${t1.input_tokens}\n`);

  // (2) 가드레일 + typical 12청크
  const sample = "특허 진보성 판단 기준을 알려줘";
  const search = await hybridSearch(adminClient, sample, { topK: 12 });
  const items = buildContextItems(search.hits);
  const full = buildSystemPrompt(items);
  process.stdout.write(`\n=== (2) 가드레일 + top-12 청크 (질문 샘플: "${sample}") ===\n`);
  process.stdout.write(`문자 수: ${full.length}  · 청크 수: ${items.length}\n`);
  const t2 = await client.messages.countTokens({
    model: AI_QNA_MODEL,
    system: full,
    messages: [{ role: "user", content: sample }],
  });
  process.stdout.write(`토큰 수: ${t2.input_tokens}\n`);

  // 판정
  const SONNET_MIN_PREFIX = 2048;
  process.stdout.write(`\n=== 판정 ===\n`);
  process.stdout.write(`가드레일: ${t1.input_tokens} 토큰 (Sonnet 4.6 최소 캐시 prefix=${SONNET_MIN_PREFIX})\n`);
  if (t1.input_tokens >= SONNET_MIN_PREFIX) {
    process.stdout.write(`✓ 가드레일 ≥ ${SONNET_MIN_PREFIX} — 분리 캐싱 (가드레일에만 cache_control) 회생 가능. v9 후속 PR 후보.\n`);
  } else {
    process.stdout.write(`✗ 가드레일 < ${SONNET_MIN_PREFIX} — 현 구조 캐싱 불가. 캐싱 이번 라운드 폐기.\n`);
  }
  process.stdout.write(`총 입력(가드레일+컨텍스트+질문): ${t2.input_tokens} 토큰\n`);
  process.stdout.write(`컨텍스트(12청크) 단독 기여: ${t2.input_tokens - t1.input_tokens} 토큰 (추정)\n`);
}

main().catch((e) => {
  process.stderr.write(`FATAL: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
