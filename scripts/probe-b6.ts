// v8-B1 빠른 검증 — b6 단건 retrieval 확인 (practice_intent path 발동 여부 + 정답 청크 top-12 진입).
import "dotenv/config";
import adminClient from "../app/core/lib/supa-admin-client.server";
import { hybridSearch } from "../app/features/ai-qna/lib/hybrid-search.server";

const b6 =
  "특허·실용신안 심사기준에 따르면, 분할출원의 원출원이 분할출원 당시에는 계속 중이었으나 분할출원 후에 반려된 경우, 그 분할출원의 출원일은 어떻게 처리되며, 거절이유가 없는 경우 심사관은 어떤 방법으로 이를 통지하는가?";

const TARGET_CHUNK = "b594fbc0-24b7-4fbc-a769-47dc63005b33";

const r = await hybridSearch(adminClient, b6, { topK: 12 });
process.stdout.write(`parsed.practiceIntent: ${r.parsed.practiceIntent}\n`);
process.stdout.write(`perPathCounts: ${JSON.stringify(r.perPathCounts)}\n`);
process.stdout.write(`\ntop-12 hits:\n`);
r.hits.forEach((h, i) => {
  const star = h.chunkId === TARGET_CHUNK ? "★ TARGET" : "";
  process.stdout.write(`  ${i + 1}. [${h.sourceType}/T${h.authorityTier}] ${h.headingPath?.slice(0, 70)}  ${star}\n`);
});
const idx = r.hits.findIndex((h) => h.chunkId === TARGET_CHUNK);
process.stdout.write(`\ntarget chunk ${idx >= 0 ? `IN top-12 at rank ${idx + 1}` : "STILL MISSING"}\n`);
