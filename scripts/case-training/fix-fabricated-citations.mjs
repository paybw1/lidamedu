// 2차 훈련 논점의 **지어낸 사건번호** 정정(2026-09-01, 원장 지시).
//
// 네 곳(cases DB · case_lower_courts · casenote · 웹 검색) 모두에서 확인되지 않은 3건.
// 법리 서술 자체는 맞고 **번호만 실재하지 않는 번호**였다 — 그래서 읽어서는 안 잡혔다.
//
// 교체 근거(전부 확인함):
//   2005후3352 → 2005후3284  casenote 원문에 "특허발명이 상업적으로 성공을 하였다는 점은
//                            진보성을 인정하는 하나의 자료로 참고할 수 있지만" 판시 확인.
//                            ★같은 항목의 다른 논점이 이미 2005후3284 를 올바로 인용 중이었다.
//   2009후3919 → 2007후1510  우리 DB 원문에 '유사필수적'·'고유필수적' 모두 포함(2009-05-28).
//   2015다257538 → 2014다42110 우리 DB 원문에 '생산'·'수출'·'국내에서' 포함(2015-07-23).
//                            법무부 자료로도 "반제품이 우리나라에서 생산·수출된 후 외국에서
//                            완성품 생산" 사안의 국내생산 법리 판결로 확인.
//
// ★번호만 바꾼다 — 법리 서술은 손대지 않는다(맞는 서술이다).
// ★적용 전 백업 + 앵커 유일성 확인. dry-run 기본.
//
//   npx tsx scripts/case-training/fix-fabricated-citations.mjs
//   npx tsx scripts/case-training/fix-fabricated-citations.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const BACKUP_DIR = path.resolve(process.cwd(), "tmp", "citation-fix");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** 지어낸 번호 → 확인된 실제 번호. */
const REPLACEMENTS = [
  { from: "2005후3352", to: "2005후3284" },
  { from: "2009후3919", to: "2007후1510" },
  { from: "2015다257538", to: "2014다42110" },
];

const FIELDS = ["label", "description_md", "model_conclusion_md"];

async function main() {
  const { data, error } = await sb
    .from("case_training_issues")
    .select("issue_id, item_id, label, description_md, model_conclusion_md")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const plan = [];
  for (const r of data ?? []) {
    for (const { from, to } of REPLACEMENTS) {
      const patch = {};
      let hits = 0;
      for (const f of FIELDS) {
        const v = r[f];
        if (typeof v !== "string" || !v.includes(from)) continue;
        // 앵커 유일성 — 같은 필드에 여러 번 있으면 전부 같은 인용이므로 모두 바꾼다.
        hits += v.split(from).length - 1;
        patch[f] = v.split(from).join(to);
      }
      if (hits > 0) plan.push({ row: r, from, to, patch, hits });
    }
  }

  console.log(`정정 대상 ${plan.length}건`);
  for (const p of plan) {
    console.log(
      `  ${p.from} → ${p.to}  (${p.hits}곳)  「${String(p.row.label).slice(0, 40)}」`,
    );
    for (const [f, v] of Object.entries(p.patch)) {
      const i = v.indexOf(p.to);
      console.log(`      ${f}: …${v.slice(Math.max(0, i - 60), i + 40)}…`);
    }
  }

  if (!APPLY) {
    console.log("\n[dry-run] --apply 를 붙이면 정정합니다.");
    return;
  }
  if (plan.length === 0) return;

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `backup-${plan.length}-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      plan.map((p) => ({
        issue_id: p.row.issue_id,
        from: p.from,
        to: p.to,
        before: Object.fromEntries(FIELDS.map((f) => [f, p.row[f]])),
      })),
      null,
      2,
    ),
  );
  console.log(`\n백업: ${backup}`);

  let done = 0;
  for (const p of plan) {
    const { error: upd } = await sb
      .from("case_training_issues")
      .update(p.patch)
      .eq("issue_id", p.row.issue_id);
    if (upd) {
      console.log(`  ✗ ${p.row.issue_id}: ${upd.message}`);
      continue;
    }
    done += 1;
    console.log(`  ✓ ${p.from} → ${p.to}  ${p.row.issue_id}`);
  }
  console.log(`\n정정 ${done}/${plan.length}건 완료.`);
  console.log("★감사를 다시 돌려 경고가 사라지는지 확인하세요:");
  console.log("   npx tsx scripts/case-training/audit-training-issues.mjs --publish");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
