// 생성·검증 완료된 채점기준·모범답안 DB 반영 (feat-2-034 최종 단계).
// problems.model_answer_md / grading_rubric_md / rubric_items 업데이트.
// 반드시 --dry 로 먼저 검증 후, 사용자 승인 하에 --apply 실행 (rule 8).
// --apply 시 대상 문항의 기존 3필드를 tmp/rubric-gen/db-backup-{ts}.json 에 백업 후 진행.
//
//   node scripts/jagwa/apply-rubric-to-db.mjs --dry
//   node scripts/jagwa/apply-rubric-to-db.mjs --apply [--laws patent,trademark,design]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const GEN_DIR = "tmp/rubric-gen";
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const APPLY = argv.includes("--apply");
if (!DRY && !APPLY) {
  console.error("사용: --dry | --apply [--laws patent,trademark,design]");
  process.exit(1);
}
const lawsArg = (() => {
  const i = argv.indexOf("--laws");
  return i >= 0 ? argv[i + 1].split(",") : ["patent", "trademark", "design", "civil-procedure"];
})();

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 생성 결과 로드
const items = [];
for (const f of readdirSync(GEN_DIR)) {
  const m = f.match(/^([a-z-]+)-(\d{4})\.json$/);
  if (!m || !lawsArg.includes(m[1])) continue;
  items.push(...JSON.parse(readFileSync(join(GEN_DIR, f), "utf8")));
}
console.log(`대상 ${items.length}문항 (laws: ${lawsArg.join(",")})`);

// 현재 DB 상태 조회 (덮어쓰기 충돌 검사 + 백업 재료)
const current = new Map();
for (let i = 0; i < items.length; i += 100) {
  const ids = items.slice(i, i + 100).map((it) => it.problem_id);
  const { data, error } = await supa
    .from("problems")
    .select("problem_id, model_answer_md, grading_rubric_md, rubric_items")
    .in("problem_id", ids);
  if (error) throw error;
  for (const r of data) current.set(r.problem_id, r);
}

let missing = 0;
let wouldOverwrite = 0;
let pointsMismatch = 0;
for (const it of items) {
  const cur = current.get(it.problem_id);
  if (!cur) {
    missing++;
    console.warn(`  ✗ DB 에 없음: ${it.law} ${it.year} 문제${it.problem_number} (${it.problem_id})`);
    continue;
  }
  if ((cur.model_answer_md ?? "").trim() || (cur.grading_rubric_md ?? "").trim()) {
    wouldOverwrite++;
    console.warn(`  ⚠ 기존값 있음(덮어씀): ${it.law} ${it.year} 문제${it.problem_number}`);
  }
  const sum = (it.rubric_items ?? []).reduce((s, r) => s + r.points, 0);
  if (it.total_points != null && sum !== it.total_points) {
    pointsMismatch++;
    console.warn(`  ⚠ 체크리스트 배점 합 ${sum}≠${it.total_points}: ${it.law} ${it.year} 문제${it.problem_number}`);
  }
}
console.log(`\nDB 미존재 ${missing} · 기존값 덮어씀 ${wouldOverwrite} · 배점 합 불일치 ${pointsMismatch}`);

if (DRY) {
  console.log("--dry 종료 (변경 없음)");
  process.exit(0);
}

// ── APPLY ──
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(GEN_DIR, `db-backup-${ts}.json`);
writeFileSync(backupPath, JSON.stringify([...current.values()], null, 1), "utf8");
console.log(`백업: ${backupPath} (${current.size}건)`);

let ok = 0;
let fail = 0;
for (const it of items) {
  if (!current.has(it.problem_id)) continue;
  const { error } = await supa
    .from("problems")
    .update({
      model_answer_md: it.model_answer_md,
      grading_rubric_md: it.grading_rubric_md,
      rubric_items: it.rubric_items,
    })
    .eq("problem_id", it.problem_id);
  if (error) {
    fail++;
    console.warn(`  ✗ ${it.law} ${it.year}-${it.problem_number}: ${error.message}`);
  } else ok++;
}
console.log(`반영 완료: ${ok}건 / 실패 ${fail}건`);
