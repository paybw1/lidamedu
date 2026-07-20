// 판례 교재 편집물(요지·이유·평석·제목·요지항목·교재섹션·관련)에서 "특허청"→"지식재산처"
// 치환. ★"특허청구"(구 앞)는 보존(negative lookahead). 모음 종결 '처' 뒤 자음형 조사 교정.
// ★official_text_md(판례 원문)은 제외. dry-run 기본, --apply 로 실제 반영(+백업).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const TEXT_COLS = [
  "case_title",
  "summary_title",
  "summary_body_md",
  "reasoning_md",
  "comment_label",
  "comment_body_md",
  "comment_source",
  "related_md",
];
const JSON_COLS = ["summary_items", "book_sections"];

// 문자열 1개 변환.
function tx(s) {
  if (typeof s !== "string" || !s.includes("특허청")) return s;
  let out = s.replace(/특허청(?!구)/g, "지식재산처"); // 특허청구 보존
  // 조사 교정 — '처'(모음) 뒤 자음형 조사. '장' 개재 시(지식재산처장은…)는 미해당(정상).
  out = out.replace(/지식재산처은/g, "지식재산처는");
  out = out.replace(/지식재산처을/g, "지식재산처를");
  out = out.replace(/지식재산처과/g, "지식재산처와");
  out = out.replace(/지식재산처으로/g, "지식재산처로");
  out = out.replace(/지식재산처이나/g, "지식재산처나"); // 이나(선택) → 나
  out = out.replace(/지식재산처이(?=\s|,|\)|」|』|$)/g, "지식재산처가"); // 주격 이 → 가
  return out;
}

// JSON 값(문자열)만 재귀 변환 — 키·구조 불변.
function txDeep(v) {
  if (typeof v === "string") return tx(v);
  if (Array.isArray(v)) return v.map(txDeep);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = txDeep(val);
    return o;
  }
  return v;
}

const c = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

let all = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c
    .from("cases")
    .select(
      "case_id," + TEXT_COLS.join(",") + "," + JSON_COLS.join(","),
    )
    .is("deleted_at", null)
    .range(from, from + 999);
  if (error) {
    console.error("load err", error.message);
    process.exit(1);
  }
  all = all.concat(data);
  if (data.length < 1000) break;
}

const changes = []; // { case_id, updates:{col:new}, backup:{col:old} }
let colCounts = {};
for (const row of all) {
  const updates = {};
  const backup = {};
  for (const col of TEXT_COLS) {
    const nv = tx(row[col]);
    if (nv !== row[col]) {
      updates[col] = nv;
      backup[col] = row[col];
      colCounts[col] = (colCounts[col] || 0) + 1;
    }
  }
  for (const col of JSON_COLS) {
    if (row[col] == null) continue;
    const nv = txDeep(row[col]);
    if (JSON.stringify(nv) !== JSON.stringify(row[col])) {
      updates[col] = nv;
      backup[col] = row[col];
      colCounts[col] = (colCounts[col] || 0) + 1;
    }
  }
  if (Object.keys(updates).length) changes.push({ case_id: row.case_id, updates, backup });
}

// 안전 검증 — 변환 후 잔여 이상 패턴 스캔.
let leftover = 0;
const badRe = /지식재산처(은|을|과|으로|이나|이[\s,]|구)/g;
for (const ch of changes) {
  for (const col of Object.keys(ch.updates)) {
    const t = typeof ch.updates[col] === "string" ? ch.updates[col] : JSON.stringify(ch.updates[col]);
    const m = t.match(badRe);
    if (m) leftover += m.length;
  }
}

console.log(`대상 판례: ${changes.length}건`);
console.log("컬럼별 변경 판례 수:", JSON.stringify(colCounts));
console.log(`변환 후 잔여 의심패턴(지식재산처+자음조사/이/구): ${leftover} (0이어야 정상)`);

// 조사 교정이 일어난 컨텍스트 샘플(검수용)
console.log("=== 조사 교정 샘플(before → after) ===");
let shown = 0;
for (const ch of changes) {
  for (const col of Object.keys(ch.backup)) {
    const oldT = typeof ch.backup[col] === "string" ? ch.backup[col] : JSON.stringify(ch.backup[col]);
    const newT = typeof ch.updates[col] === "string" ? ch.updates[col] : JSON.stringify(ch.updates[col]);
    // 은/을/과/으로/이나/이 주격이 실제로 바뀐 위치만
    for (const p of ["특허청은", "특허청을", "특허청과", "특허청으로", "특허청이나", "특허청이 "]) {
      let idx = oldT.indexOf(p);
      if (idx >= 0 && shown < 20) {
        const oldSnip = oldT.slice(Math.max(0, idx - 5), idx + 10).replace(/\n/g, " ");
        const ni = newT.indexOf(oldSnip.replace(/특허청/g, "지식재산처").replace(/지식재산처은/, "지식재산처는").replace(/지식재산처을/, "지식재산처를").replace(/지식재산처과/, "지식재산처와").replace(/지식재산처으로/, "지식재산처로").replace(/지식재산처이나/, "지식재산처나").replace(/지식재산처이 /, "지식재산처가 "));
        console.log(`  [${col}] …${oldSnip}…`);
        shown++;
      }
    }
  }
}

if (!APPLY) {
  console.log("\n(DRY-RUN) 실제 반영하려면 --apply. 백업은 apply 시 저장.");
  process.exit(0);
}

// 백업 저장
const backupPath = "scripts/assets/kipo-rename-backup.json";
writeFileSync(backupPath, JSON.stringify(changes.map((c) => ({ case_id: c.case_id, backup: c.backup })), null, 2), "utf8");
console.log(`백업 저장: ${backupPath} (${changes.length}건)`);

let ok = 0, fail = 0;
for (const ch of changes) {
  const { error } = await c.from("cases").update(ch.updates).eq("case_id", ch.case_id);
  if (error) { console.error("update fail", ch.case_id, error.message); fail++; }
  else ok++;
}
console.log(`반영 완료: 성공 ${ok} · 실패 ${fail}`);
