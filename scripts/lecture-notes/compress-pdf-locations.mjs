// 연속 페이지 압축 — target(조문/판례)별 연속 블록(run)마다 첫 페이지만 남기고
// continuation(둘째 이후)을 제거. 분리된 run 의 첫 페이지(진입점)는 모두 보존.
// dry-run(기본): 삭제대상 산출 + 하드스톱 검산 + JSON 기록(변경 없음).
// --apply: 백업 후 continuation hard-delete (extract-pdf-locations 재실행으로 전량 복원 가능 — 파생물).
//
// 사용: node scripts/lecture-notes/compress-pdf-locations.mjs           # dry-run
//       node scripts/lecture-notes/compress-pdf-locations.mjs --apply   # 적용(백업 후)
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

const ROOT = process.cwd();
dotenv.config({ path: resolve(ROOT, ".env") });
const APPLY = process.argv.includes("--apply");
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const OUT_DIR = resolve(ROOT, "tmp/lecture-notes/compress");

async function fetchNumbers(table, idCol, numCol, ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { data } = await supa.from(table).select(`${idCol}, ${numCol}`).in(idCol, slice);
    for (const r of data ?? []) map.set(r[idCol], r[numCol]);
  }
  return map;
}

async function main() {
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}`);
  const { data: rows, error } = await supa
    .from("lecture_pdf_locations")
    .select("location_id, target_type, target_id, page, label");
  if (error) throw error;
  console.log(`총 링크: ${rows.length}`);

  // group by target
  const byTarget = new Map();
  for (const r of rows) {
    const k = `${r.target_type}:${r.target_id}`;
    if (!byTarget.has(k)) byTarget.set(k, []);
    byTarget.get(k).push(r);
  }

  const toDelete = []; // continuation rows
  const keptByTarget = new Map(); // key -> [run-first rows]
  for (const [k, list] of byTarget) {
    list.sort((a, b) => a.page - b.page);
    let prev = null;
    let runStart = null;
    const kept = [];
    for (const r of list) {
      if (prev === null || r.page - prev > 1) {
        runStart = r.page;
        kept.push(r);
      } else {
        toDelete.push({ ...r, run_start: runStart, prev_page: prev });
      }
      prev = r.page;
    }
    keptByTarget.set(k, kept);
  }

  // ── 하드스톱 검산 ──
  const delIds = new Set(toDelete.map((r) => r.location_id));
  const keptRows = [...keptByTarget.values()].flat();
  const keptIds = new Set(keptRows.map((r) => r.location_id));
  // 1) 진입점(run 첫 페이지)이 삭제 대상에 든 것 = 0 이어야
  const entrypointInDelete = keptRows.filter((r) => delIds.has(r.location_id)).length;
  // 2) 삭제 대상이 모두 직전 페이지 +1(연속) 이어야 (비연속 삭제 = 0)
  const nonConsecutiveDeletes = toDelete.filter((r) => r.page - r.prev_page !== 1).length;
  // 3) keep+delete = 전체, 교집합 0
  const overlap = [...delIds].filter((id) => keptIds.has(id)).length;
  const partitionOk = keptIds.size + delIds.size === rows.length && overlap === 0;

  const byType = (arr, t) => arr.filter((r) => r.target_type === t).length;
  console.log(`\n=== 결과 요약 ===`);
  console.log(`삭제(continuation): ${toDelete.length}  (article ${byType(toDelete, "article")} / case ${byType(toDelete, "case")})`);
  console.log(`유지(진입점)     : ${keptRows.length}  (article ${byType(keptRows, "article")} / case ${byType(keptRows, "case")})`);
  console.log(`\n=== 하드스톱 검산 ===`);
  console.log(`진입점이 삭제대상에 든 수 : ${entrypointInDelete}  ${entrypointInDelete === 0 ? "✅" : "❌ 중단"}`);
  console.log(`비연속(직전+1 아님) 삭제 : ${nonConsecutiveDeletes}  ${nonConsecutiveDeletes === 0 ? "✅" : "❌ 중단"}`);
  console.log(`분할 정합(keep+del=전체, 교집합0): ${partitionOk ? "✅" : "❌ 중단"}`);
  const safe = entrypointInDelete === 0 && nonConsecutiveDeletes === 0 && partitionOk;

  // 번호 매핑(보고용)
  const artIds = [...new Set(rows.filter((r) => r.target_type === "article").map((r) => r.target_id))];
  const caseIds = [...new Set(rows.filter((r) => r.target_type === "case").map((r) => r.target_id))];
  const artNum = await fetchNumbers("articles", "article_id", "article_number", artIds);
  const caseNum = await fetchNumbers("cases", "case_id", "case_number", caseIds);
  const numOf = (r) => (r.target_type === "article" ? artNum.get(r.target_id) : caseNum.get(r.target_id)) ?? "?";

  // 삭제 표본(article, 페이지순)
  console.log(`\n=== 삭제 표본 (article, 25건) ===`);
  const artDel = toDelete.filter((r) => r.target_type === "article").sort((a, b) => (numOf(a) + "").localeCompare(numOf(b) + "") || a.page - b.page);
  for (const r of artDel.slice(0, 25)) {
    console.log(`  제${numOf(r)}조  삭제 p${r.page}  (run시작 p${r.run_start}, 직전 p${r.prev_page} → +${r.page - r.prev_page})`);
  }

  // 라벨 모호 후보: 진입점 2개 이상 유지되는 target
  console.log(`\n=== 진입점 2개 이상 유지 (라벨 모호 후보) ===`);
  const ambig = [...keptByTarget.entries()]
    .map(([k, kept]) => ({ k, type: kept[0].target_type, num: numOf(kept[0]), pages: kept.map((r) => r.page) }))
    .filter((x) => x.pages.length >= 2)
    .sort((a, b) => b.pages.length - a.pages.length);
  console.log(`  총 ${ambig.length}개 target (article ${ambig.filter((x) => x.type === "article").length} / case ${ambig.filter((x) => x.type === "case").length})`);
  for (const x of ambig.filter((x) => x.type === "article").slice(0, 20)) {
    console.log(`  ${x.type === "article" ? "제" + x.num + "조" : x.num}: 진입점 ${x.pages.length}개 → p[${x.pages.join(", ")}]`);
  }

  // JSON 기록
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "delete-targets.json"), JSON.stringify(toDelete, null, 2));
  writeFileSync(resolve(OUT_DIR, "keep-entrypoints.json"), JSON.stringify(keptRows.map((r) => ({ ...r, num: numOf(r) })), null, 2));
  console.log(`\n기록: ${OUT_DIR}/delete-targets.json (${toDelete.length}) · keep-entrypoints.json (${keptRows.length})`);

  if (!APPLY) {
    console.log(`\n(dry-run — DB 변경 없음. 검산 통과 + 승인 후 --apply)`);
    return;
  }
  if (!safe) {
    console.error(`\n[중단] 하드스톱 검산 실패 — 삭제하지 않음.`);
    process.exit(1);
  }
  // 백업
  mkdirSync(resolve(ROOT, "tmp/lecture-notes/backup"), { recursive: true });
  writeFileSync(resolve(ROOT, "tmp/lecture-notes/backup/lecture_pdf_locations-pre-compress.json"), JSON.stringify(rows, null, 2));
  console.log(`\n[apply] 백업: tmp/lecture-notes/backup/lecture_pdf_locations-pre-compress.json (${rows.length}행)`);
  // 삭제 (batch)
  const ids = [...delIds];
  let done = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200);
    const { error: dErr } = await supa.from("lecture_pdf_locations").delete().in("location_id", slice);
    if (dErr) throw new Error(`delete batch ${i} 실패: ${dErr.message}`);
    done += slice.length;
  }
  const { count } = await supa.from("lecture_pdf_locations").select("*", { count: "exact", head: true });
  console.log(`[apply] 삭제 ${done}행. 남은 링크: ${count} (예상 ${keptRows.length})`);
}
main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
