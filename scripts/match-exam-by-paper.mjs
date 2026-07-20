// 실제 시험지(산재 hwpx)로 특허 문제의 exam_number 매칭.
// 특허법 = 시험지 Q1~(상표법 시작 전). DB 문제 body ↔ 시험지 문항 본문 4-gram Jaccard 최대.
// 사용: node scripts/match-exam-by-paper.mjs <YEAR> [--apply]
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import dotenv from "dotenv";
dotenv.config();

const YEAR = Number(process.argv[2]);
const APPLY = process.argv.includes("--apply");
if (!YEAR) { console.error("YEAR 인자 필요"); process.exit(1); }

const PAPER_DIR = "source/기출모음(2010~2026)/1차/문제";
const file = readdirSync(PAPER_DIR).find((f) => f.startsWith(`${YEAR}_`) && /산재/.test(f) && f.endsWith(".hwpx"));
if (!file) { console.error(`${YEAR} 산재 시험지 없음`); process.exit(1); }
console.log("시험지:", file);

// hwpx unzip → 문단별 텍스트
const work = mkdtempSync(join(tmpdir(), "exam-"));
execSync(`cd "${work}" && unzip -o -q "${process.cwd()}/${PAPER_DIR}/${file}"`, { shell: "bash" });
const secs = readdirSync(join(work, "Contents")).filter((f) => /^section\d+\.xml$/.test(f)).sort();
let paras = [];
for (const s of secs) {
  const xml = readFileSync(join(work, "Contents", s), "utf8");
  for (const pm of xml.matchAll(/<hp:p[ >][\s\S]*?<\/hp:p>/g)) {
    const t = [...pm[0].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((x) => x[1].replace(/<[^>]+>/g, "")).join("");
    if (t.trim()) paras.push(t.trim());
  }
}
// 문항 분할
const starts = [];
paras.forEach((p, i) => { const m = /^(\d{1,2})\.\s*\S/.exec(p); if (m) starts.push({ n: Number(m[1]), i }); });
let exp = 1, kept = [];
for (const st of starts) { if (st.n === exp) { kept.push(st); exp++; } }
const questions = {};
for (let j = 0; j < kept.length; j++) {
  const s = kept[j].i, e = j + 1 < kept.length ? kept[j + 1].i : paras.length;
  questions[kept[j].n] = paras.slice(s, e).join(" ");
}
// 특허법 범위 = 상표법 첫 문항 전까지
let trademarkStart = 99;
for (const [n, txt] of Object.entries(questions)) { if (/상표법/.test(txt) && Number(n) < trademarkStart) trademarkStart = Number(n); }
const patentQs = Object.entries(questions).filter(([n]) => Number(n) < trademarkStart).map(([n, t]) => ({ n: Number(n), t }));
console.log(`특허 문항: Q1~Q${trademarkStart - 1} (${patentQs.length}개)`);

// 발문(stem)만 추출 — 첫 선택지(①) 이전. 책/시험지 간 거의 동일해 매칭 신뢰도↑.
function stemOf(s) {
  const t = (s || "").replace(/^\s*\d{1,2}\.\s*/, "");
  const cut = t.search(/[①-⑤㉠]/);
  return (cut > 0 ? t.slice(0, cut) : t).slice(0, 120);
}
function grams(s) {
  const c = stemOf(s).replace(/[\s　\d.,()「」『』·\-<>?？]/g, "");
  const set = new Set();
  for (let i = 0; i + 3 <= c.length; i++) set.add(c.slice(i, i + 3));
  return set;
}
function jac(a, b) { let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter / (a.size + b.size - inter || 1); }
const qGrams = patentQs.map((q) => ({ n: q.n, g: grams(q.t) }));

const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: law } = await c.from("laws").select("law_id").eq("law_code", "patent").maybeSingle();
const { data: probs } = await c.from("problems")
  .select("problem_id, problem_number, exam_number, origin, display_no, body_md")
  .eq("law_id", law.law_id).eq("year", YEAR).in("origin", ["past_exam", "past_exam_variant"]).is("deleted_at", null)
  .order("display_no");

const FILL_NULL = process.argv.includes("--fill-null"); // 기존 exam_number 유지, null 만 채움
const results = [];
for (const p of probs) {
  const g = grams(p.body_md);
  let best = null, second = 0;
  for (const q of qGrams) { const s = jac(g, q.g); if (!best || s > best.s) { second = best ? best.s : 0; best = { n: q.n, s }; } else if (s > second) second = s; }
  results.push({ ...p, bestQ: best?.n, score: best?.s ?? 0, margin: (best?.s ?? 0) - second });
}

if (FILL_NULL) {
  // null 인 문제만, 확신(score≥0.7 & margin≥0.08) 시 채움. 중복 허용(타겟팅 limit(1) 로 무해).
  const fill = results.filter((r) => r.exam_number == null && r.score >= 0.7 && r.margin >= 0.08);
  console.log(`\n=== ${YEAR} fill-null 후보 (${fill.length}건) ===`);
  fill.forEach((r) => console.log(` P-${r.display_no} num=${r.problem_number} → Q${r.bestQ} score=${r.score.toFixed(2)} m=${r.margin.toFixed(2)}`));
  const stillNull = results.filter((r) => r.exam_number == null && !(r.score >= 0.7 && r.margin >= 0.08));
  console.log(` (미매칭 잔여 ${stillNull.length}: ${stillNull.map(r=>`P-${r.display_no}`).join(",")})`);
  if (APPLY) {
    let ok = 0;
    for (const r of fill) { const { error } = await c.from("problems").update({ exam_number: r.bestQ }).eq("problem_id", r.problem_id); if (!error) ok++; }
    console.log(`반영: ${ok}건`);
  } else console.log("(DRY-RUN) --apply 로 반영");
  process.exit(0);
}
// 시험번호별 최고 점수 1건만 채택(중복 방지)
const byQ = {};
for (const r of results) { if (r.score < 0.12) continue; if (!byQ[r.bestQ] || r.score > byQ[r.bestQ].score) byQ[r.bestQ] = r; }
console.log(`\n=== ${YEAR} 매칭 (score≥0.12, 시험번호당 최고 1건) ===`);
const chosen = new Set(Object.values(byQ).map((r) => r.problem_id));
for (const r of results) {
  const win = byQ[r.bestQ]?.problem_id === r.problem_id;
  console.log(` P-${r.display_no} num=${r.problem_number} exam(기존)=${r.exam_number ?? "-"} → Q${r.bestQ} score=${r.score.toFixed(2)} m=${r.margin.toFixed(2)} ${win ? "✓채택" : (r.score<0.12?"(약함)":"(중복탈락)")}`);
}

if (!APPLY) { console.log("\n(DRY-RUN) --apply 로 반영"); process.exit(0); }
let ok = 0;
for (const r of Object.values(byQ)) {
  const { error } = await c.from("problems").update({ exam_number: r.bestQ }).eq("problem_id", r.problem_id);
  if (error) console.error("fail", r.display_no, error.message); else ok++;
}
console.log(`반영: ${ok}건`);
