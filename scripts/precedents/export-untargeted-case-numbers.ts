// 전문 미적재 cases 의 사건번호 추출 → tmp/casenum-batch.txt.
//
// 사용:
//   npx tsx scripts/precedents/export-untargeted-case-numbers.ts
//   npx tsx scripts/precedents/export-untargeted-case-numbers.ts --out tmp/x.txt

import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPA = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = resolve(
  process.cwd(),
  outIdx >= 0 && outIdx + 1 < args.length ? args[outIdx + 1] : "tmp/casenum-batch.txt",
);

const { data, error } = await SUPA
  .from("cases")
  .select("case_number, decided_at, importance")
  .or("official_text_md.is.null,official_text_md.eq.")
  .is("deleted_at", null)
  .order("decided_at", { ascending: false });
if (error) { process.stderr.write(`SELECT 실패: ${error.message}\n`); process.exit(1); }

const lines: string[] = [
  `# 전문 미적재 cases 사건번호 — ${new Date().toISOString()}`,
  `# 총 ${(data ?? []).length}건. 최신 선고일 순.`,
  "",
  ...(data ?? []).map((r) => r.case_number),
];

mkdirSync(resolve(OUT, ".."), { recursive: true });
writeFileSync(OUT, lines.join("\n"), "utf-8");
process.stdout.write(`✓ ${(data ?? []).length}건 → ${OUT}\n`);
