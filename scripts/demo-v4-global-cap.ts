// v4-③ 시연 — 전역 토큰 cap 게이트가 작동하는지 확인.
//
// 실행:
//   AI_QNA_DAILY_INPUT_TOKEN_CAP=10000 npx tsx scripts/demo-v4-global-cap.ts
//
// 사전 조건: ai_usage_daily 오늘치 행이 cap(10000) 위로 누적되어 있어야 함.
//   (위 마이그레이션 후 SQL 로 input=50000 강제 세팅 완료)
//
// 기대 출력:
//   blocked: true
//   reason: daily_input_token_cap | cap: 10000 | current: 50000
//   user message: 오늘 전체 사용량이 운영 한도에 도달했습니다 ...
import "dotenv/config";

import adminClient from "../app/core/lib/supa-admin-client.server";
import {
  capBlockedMessage,
  checkGlobalCap,
} from "../app/features/ai-qna/lib/usage-tracker.server";

const check = await checkGlobalCap(adminClient);
process.stdout.write(
  `\n=== v4-③ Global Cap Demo ===\n`
    + `env AI_QNA_DAILY_INPUT_TOKEN_CAP : ${process.env.AI_QNA_DAILY_INPUT_TOKEN_CAP ?? "(unset)"}\n`
    + `env AI_QNA_DAILY_OUTPUT_TOKEN_CAP: ${process.env.AI_QNA_DAILY_OUTPUT_TOKEN_CAP ?? "(unset)"}\n`
    + `env AI_QNA_DAILY_COST_USD_CAP    : ${process.env.AI_QNA_DAILY_COST_USD_CAP ?? "(unset)"}\n\n`,
);
process.stdout.write(`today usage: ${JSON.stringify(check.usage)}\n`);
process.stdout.write(`blocked    : ${check.blocked}\n`);
if (check.blocked) {
  process.stdout.write(`reason     : ${check.reason}\n`);
  process.stdout.write(`cap        : ${check.cap}\n`);
  process.stdout.write(`current    : ${check.current}\n`);
  process.stdout.write(`user msg   : ${capBlockedMessage(check)}\n`);
}
