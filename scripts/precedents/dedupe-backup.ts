// case_number dedupe 작업 백업 — 6 cases row + 영향 LR + rollback.sql 생성.
// 마이그 적용 전에 실행. 결과는 tmp/dedupe-backup-<ts>/ 에 보존.

import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const CASE_IDS = {
  s_2023: "23e1fd4f-6dbc-4b9a-9f06-aa1eb07f5c69",
  l_2023: "d43a8d16-b3e2-46b5-a7d3-36b491868c38",
  s_2024: "eb33eed0-1628-495f-825d-4063df2f9979",
  l_2024: "16583d09-ba44-4a2f-b14e-f2ad00e4fa7e",
  s_2025: "b1185412-d3d7-4acc-b90c-13a9e434b818",
  l_2025: "1f619473-8f70-477a-9c55-effd26ad01d8",
} as const;
const LR_ID = "c0f26187-9a50-4aa6-a8f6-de4cca19d601";

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const DIR = resolve(process.cwd(), `tmp/dedupe-backup-${ts}`);
mkdirSync(DIR, { recursive: true });
process.stdout.write(`\n=== dedupe backup ${ts} ===\n  dir: ${DIR}\n\n`);

// 1) cases 6 row 전체 dump.
const { data: cases, error: e1 } = await SUPA
  .from("cases")
  .select("*")
  .in("case_id", Object.values(CASE_IDS));
if (e1) { process.stderr.write(`cases dump 실패: ${e1.message}\n`); process.exit(1); }
const casesPath = resolve(DIR, "cases-6rows.json");
writeFileSync(casesPath, JSON.stringify(cases, null, 2), "utf-8");
process.stdout.write(`  ✓ cases: ${cases?.length} rows → ${casesPath}\n`);

// 2) LR 1건 dump (현재 상태 — target_id = loser).
const { data: lr, error: e2 } = await SUPA
  .from("lecture_resources")
  .select("*")
  .eq("resource_id", LR_ID);
if (e2) { process.stderr.write(`LR dump 실패: ${e2.message}\n`); process.exit(1); }
const lrPath = resolve(DIR, "lecture_resources-affected.json");
writeFileSync(lrPath, JSON.stringify(lr, null, 2), "utf-8");
process.stdout.write(`  ✓ LR: ${lr?.length} row → ${lrPath}\n`);

// 3) rollback.sql — 역 작업.
const rollback = `-- Rollback for dedupe migration applied at ${ts}.
-- 적용된 변경:
--   a) lecture_resources.target_id repoint (${CASE_IDS.l_2023} → ${CASE_IDS.s_2023})
--   b) CREATE UNIQUE INDEX cases_case_number_unique_active
--
-- 이 파일을 적용하면 두 변경이 모두 역방향으로 복구됨.

BEGIN;

-- (b 역) partial unique index 제거.
DROP INDEX IF EXISTS public.cases_case_number_unique_active;

-- (a 역) lecture_resources.target_id 원래 (loser) 로 복구.
UPDATE public.lecture_resources
SET target_id = '${CASE_IDS.l_2023}'::uuid,
    updated_at = now()
WHERE resource_id = '${LR_ID}'::uuid
  AND target_type = 'case'
  AND target_id = '${CASE_IDS.s_2023}'::uuid;

-- cases 6 row 자체는 변경 안 했음 (옵션 B — soft-delete 유지).
-- 만약 hard-delete 가 발생했다면 cases-6rows.json 으로 수동 복원.

COMMIT;
`;
const rollbackPath = resolve(DIR, "rollback.sql");
writeFileSync(rollbackPath, rollback, "utf-8");
process.stdout.write(`  ✓ rollback: ${rollbackPath}\n`);

process.stdout.write(`\n복원 절차 (필요 시):\n  psql/Supabase MCP 로 ${rollbackPath} 실행\n`);
