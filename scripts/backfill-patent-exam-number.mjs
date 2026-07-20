// 특허법 기출/변형 문제에 exam_number(실제 시험번호) 백필.
// 조인: DB (year, node, problem_number=노드순번) ↔ 색인 셀 (topic, NN=problem_number) → 행=시험번호.
// dry-run 기본, --apply 로 반영. 색인=scripts/assets/patent-exam-index.json.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config();

const APPLY = process.argv.includes("--apply");
const index = JSON.parse(readFileSync("scripts/assets/patent-exam-index.json", "utf8"));
// index[year] = [{row(=시험번호), examNo(=노드순번 NN), topic}]

function norm(s) {
  return (s || "")
    .replace(/^[\[(]?\s*\d+\s*[\])]?\s*/, "") // 선두 [02]/09 등 제거
    .replace(/\s+/g, "")
    .trim();
}
// DB 노드 라벨 ↔ 색인 topic 유사도(0~1): 정규화 후 포함/일치.
function topicScore(dbLabel, topic) {
  const a = norm(dbLabel), b = norm(topic);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  // 공통 접두 길이 기반
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 2 ? 0.4 + i * 0.05 : 0;
}

const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await c.from("laws").select("law_id").eq("law_code", "patent").maybeSingle();

let probs = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await c.from("problems")
    .select("problem_id, year, problem_number, origin, display_no, systematic_nodes:primary_node_id(display_label)")
    .eq("law_id", law.law_id).in("origin", ["past_exam", "past_exam_variant"]).is("deleted_at", null)
    .range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  probs = probs.concat(data);
  if (data.length < 1000) break;
}

const matched = []; // {problem_id, year, examNumber, ...}
const unmatched = [];
for (const p of probs) {
  const cells = (index[p.year] || []).filter((e) => e.examNo === p.problem_number);
  if (cells.length === 0) { unmatched.push({ ...p, reason: "색인에 노드순번 없음" }); continue; }
  const label = p.systematic_nodes?.display_label || "";
  let best = null, bestScore = -1;
  for (const cell of cells) {
    const s = topicScore(label, cell.topic);
    if (s > bestScore) { bestScore = s; best = cell; }
  }
  if (bestScore < 0.4) { unmatched.push({ ...p, reason: `주제 불일치(${label} vs 후보 ${cells.map(x=>x.topic).join("/")})` }); continue; }
  matched.push({ problem_id: p.problem_id, year: p.year, examNumber: best.row, label, topic: best.topic, num: p.problem_number, origin: p.origin, display_no: p.display_no, score: bestScore });
}

// 충돌: 같은 연도에 같은 exam_number 를 2건 이상이 차지?
const conflicts = {};
for (const m of matched) {
  const k = `${m.year}#${m.examNumber}`;
  (conflicts[k] = conflicts[k] || []).push(m);
}
const dup = Object.entries(conflicts).filter(([, v]) => v.length > 1);

console.log(`특허 기출/변형 총: ${probs.length}`);
console.log(`매칭 성공: ${matched.length} · 미매칭: ${unmatched.length}`);
console.log(`시험번호 충돌(같은 연도 같은 번호 2+): ${dup.length}건`);
console.log("\n=== 미매칭 샘플(최대 20) ===");
unmatched.slice(0, 20).forEach((u) => console.log(` ${u.year} num=${u.problem_number} P-${u.display_no} ${u.origin==="past_exam_variant"?"*":""} [${u.systematic_nodes?.display_label||"노드없음"}] — ${u.reason}`));
console.log("\n=== 충돌 샘플(최대 15) ===");
dup.slice(0, 15).forEach(([k, v]) => console.log(` ${k}: ${v.map(x=>`P-${x.display_no}(${x.topic}${x.origin==="past_exam_variant"?"*":""})`).join(" vs ")}`));

// 미매칭 연도별 집계
const umByYear = {};
unmatched.forEach((u) => umByYear[u.year] = (umByYear[u.year] || 0) + 1);
console.log("\n미매칭 연도별:", JSON.stringify(umByYear));

if (!APPLY) { console.log("\n(DRY-RUN) --apply 로 반영."); process.exit(0); }

// 반영: exam_number 세팅(충돌·미매칭 제외 — 안전)
const dupIds = new Set(dup.flatMap(([, v]) => v.map((x) => x.problem_id)));
const toApply = matched.filter((m) => !dupIds.has(m.problem_id));
writeFileSync("tmp/exam-number-backfill.json", JSON.stringify({ applied: toApply, unmatched, conflicts: dup }, null, 1), "utf8");
let ok = 0, fail = 0;
for (const m of toApply) {
  const { error } = await c.from("problems").update({ exam_number: m.examNumber }).eq("problem_id", m.problem_id);
  if (error) { console.error("fail", m.problem_id, error.message); fail++; } else ok++;
}
console.log(`반영 완료: ${ok} 성공 · ${fail} 실패 · 충돌 제외 ${dupIds.size}`);
