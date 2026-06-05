// 격자형(matrix) mc_box 문제의 지문이 원시 마크다운 표 행("| ○ | × | … |")으로
// 저장된 결함 정리. 원본 표의 열 머리글(보기 마커 또는 기간 등)과 각 셀을 짝지어
// "머리글 값 / 머리글 값 …" 형태의 읽을 수 있는 지문으로 변환.
//
//   node scripts/recover-expected-grid-choices.mjs            # dry-run
//   node scripts/recover-expected-grid-choices.mjs --apply

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
console.log(`proj: ${process.env.SUPABASE_URL}`);

const paras = JSON.parse(readFileSync("source/_converted/expected-problems.json", "utf8")).paragraphs;
const flat = (x) => (x || "").replace(/\s+/g, "");
const cells = (line) => line.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
const isTableChoice = (b) => /^\s*\|/.test(b) || (b.match(/\|/g) || []).length >= 2;

// 원본에서 stem 위치 → 열 머리글 행(첫 셀 빈 "|  | h1 | h2 …") 찾기.
function findHeaders(stem) {
  const needle = flat(stem).slice(0, 20);
  if (needle.length < 10) return null;
  const idx = paras.findIndex((p) => flat(p.text).includes(needle));
  if (idx < 0) return null;
  for (let k = idx + 1; k < Math.min(idx + 9, paras.length); k++) {
    const line = (paras[k].text || "").split(/\n/)[0];
    if (/^\|\s*\|/.test(line)) {
      const hs = cells(line);
      if (hs.length >= 3) return hs;
    }
  }
  return null;
}

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await supa.from("problems")
  .select("problem_id, body_md").eq("law_id", law.law_id).eq("origin", "expected").is("deleted_at", null);
const ids = probs.map((p) => p.problem_id);
const stemById = new Map(probs.map((p) => [p.problem_id, p.body_md]));

const chBy = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa.from("problem_choices").select("choice_id, problem_id, choice_index, body_md").in("problem_id", ids.slice(i, i + 100));
  for (const c of data ?? []) { if (!chBy.has(c.problem_id)) chBy.set(c.problem_id, []); chBy.get(c.problem_id).push(c); }
}

const updates = [];
const skipped = [];
for (const [pid, list] of chBy) {
  const tableChoices = list.filter((c) => isTableChoice(c.body_md));
  if (tableChoices.length === 0) continue;
  const headers = findHeaders(stemById.get(pid) ?? "");
  if (!headers) { skipped.push({ pid, reason: "원본 머리글 행 못 찾음" }); continue; }
  for (const c of tableChoices.sort((a, b) => a.choice_index - b.choice_index)) {
    const vals = cells((c.body_md || "").split(/\n/)[0]);
    let next;
    if (vals.length === headers.length) {
      next = headers.map((h, i) => `${h} ${vals[i]}`).join(" / ");
    } else {
      // 머리글 수 불일치 — 값만 정리(표 마크다운만 제거).
      next = vals.join(" / ");
      skipped.push({ pid, idx: c.choice_index, reason: `셀 ${vals.length} ≠ 머리글 ${headers.length} — 값만 정리` });
    }
    updates.push({ choice_id: c.choice_id, pid, idx: c.choice_index, old: c.body_md, new: next });
  }
}

console.log(`\n=== 격자 지문 정리 대상 ${updates.length}건 (문제 ${new Set(updates.map((u) => u.pid)).size}개) ===`);
let curPid = null;
for (const u of updates) {
  if (u.pid !== curPid) { curPid = u.pid; console.log(`\n[${u.pid}] ${JSON.stringify((stemById.get(u.pid) ?? "").slice(0, 40))}`); }
  console.log(`  #${u.idx}  ${JSON.stringify(u.old.replace(/\n/g, "\\n"))}\n      → ${JSON.stringify(u.new)}`);
}
if (skipped.length) { console.log(`\n=== 참고/건너뜀 ===`); for (const s of skipped) console.log(`  ${s.pid}${s.idx ? " #" + s.idx : ""} — ${s.reason}`); }

if (!APPLY) { console.log(`\n(dry-run — --apply 로 실행)`); process.exit(0); }
let ok = 0;
for (const u of updates) {
  const { error } = await supa.from("problem_choices").update({ body_md: u.new }).eq("choice_id", u.choice_id);
  if (error) console.error(`  실패 ${u.choice_id}: ${error.message}`); else ok++;
}
console.log(`\n완료 — ${ok}/${updates.length}`);
