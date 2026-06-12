// feat-4-A-340 — 제29조(특허요건) 문제를 체계도 소분류로 키워드 가분류.
//   산업상 이용가능성 / 신규성 / 진보성 / 확대된 선출원 4개 노드.
//   본문+선지+박스+해설 텍스트의 키워드 점수 + 조항 인용(29조 제2항→진보성 / 제3항→확대) 신호.
//   기본 dry-run(분포·샘플 출력). --apply 로 primary_node_id 반영.
//   이미 지정된(primary_node_id NOT NULL) 문제는 skip (덮어쓰지 않음).
import { config } from "dotenv";
config({ path: "C:/project/lidamedu/.env" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);
const APPLY = process.argv.includes("--apply");

const NODES = {
  industrial: { id: "71569e62-2884-4840-954b-bcc18a957c1e", label: "산업상 이용가능성" },
  novelty: { id: "1d0dcfcc-e4b7-4765-aaa0-f83977732fba", label: "신규성" },
  inventive: { id: "0371855a-405f-4023-82a1-be93e2d06900", label: "진보성" },
  expanded: { id: "0414fdbe-5db4-43d9-85c9-978c1cae23f3", label: "확대된 선출원" },
};
const PRIORITY = ["expanded", "inventive", "novelty", "industrial"]; // 동점 시 특이도 높은 순

// [category, keyword, weight] — 사용자 제시 키워드 + 특이 신호.
const KW = [
  ["industrial", "이용가능성", 5],
  ["industrial", "의료", 4],
  ["industrial", "결과물", 3],
  ["industrial", "경제", 2],
  ["industrial", "산업상", 1],
  ["novelty", "신규성", 5],
  ["novelty", "동일성", 4],
  ["novelty", "동일", 2],
  ["inventive", "진보성", 5],
  ["inventive", "사후적 고찰", 5],
  ["inventive", "용이", 3],
  ["expanded", "확대된 선출원", 8],
];

function countOcc(text, kw) {
  let i = 0, c = 0;
  while ((i = text.indexOf(kw, i)) >= 0) { c++; i += kw.length; }
  return c;
}

function score(text) {
  const norm = text.replace(/\s+/g, "");
  const s = { industrial: 0, novelty: 0, inventive: 0, expanded: 0 };
  const hits = { industrial: [], novelty: [], inventive: [], expanded: [] };
  for (const [cat, kw, w] of KW) {
    const c = countOcc(text, kw);
    if (c > 0) { s[cat] += w * Math.min(c, 3); hits[cat].push(`${kw}×${c}`); }
  }
  // 조항 인용 — 29조 제3항=확대된 선출원, 제2항=진보성 (제1항은 산업상/신규성 모호 → skip).
  if (/29조제3항/.test(norm)) { s.expanded += 6; hits.expanded.push("제3항"); }
  if (/29조제2항/.test(norm)) { s.inventive += 6; hits.inventive.push("제2항"); }
  return { s, hits };
}

function decide(s) {
  const ranked = Object.entries(s).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return PRIORITY.indexOf(a[0]) - PRIORITY.indexOf(b[0]);
  });
  const [topCat, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  if (topScore <= 0) return { cat: null, topScore, margin: 0 };
  return { cat: topCat, topScore, margin: topScore - secondScore };
}

// --- 데이터 로드 ---
const { data: art } = await sb
  .from("articles")
  .select("article_id, laws!inner(law_code)")
  .eq("laws.law_code", "patent")
  .eq("article_number", "29")
  .maybeSingle();
if (!art) { console.error("제29조 article 못 찾음"); process.exit(1); }

const { data: problems } = await sb
  .from("problems")
  .select("problem_id, year, problem_number, body_md, explanation_md, primary_node_id")
  .eq("primary_article_id", art.article_id)
  .is("deleted_at", null);

const candidates = (problems ?? []).filter((p) => p.primary_node_id == null);
const already = (problems ?? []).length - candidates.length;
const ids = candidates.map((p) => p.problem_id);

// 선지 + 박스 텍스트 batch.
const textById = new Map(candidates.map((p) => [p.problem_id, `${p.body_md ?? ""}\n${p.explanation_md ?? ""}`]));
for (const tbl of ["problem_choices", "problem_box_items"]) {
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from(tbl).select("problem_id, body_md").in("problem_id", ids.slice(i, i + 200));
    for (const r of data ?? []) {
      if (r.body_md) textById.set(r.problem_id, `${textById.get(r.problem_id) ?? ""}\n${r.body_md}`);
    }
  }
}

// --- 분류 ---
const byCat = { industrial: [], novelty: [], inventive: [], expanded: [] };
const unclassified = [];
const lowConf = [];
const assignments = [];
for (const p of candidates) {
  const { s, hits } = score(textById.get(p.problem_id) ?? "");
  const { cat, topScore, margin } = decide(s);
  const tag = `${p.year}#${p.problem_number}`;
  if (!cat) { unclassified.push(tag); continue; }
  const rec = { tag, cat, topScore, margin, hits: hits[cat].join(",") };
  byCat[cat].push(rec);
  assignments.push({ problem_id: p.problem_id, node_id: NODES[cat].id });
  if (margin <= 1 || topScore <= 2) lowConf.push(`${tag}→${NODES[cat].label}(${topScore},m${margin}:${rec.hits})`);
}

// --- 출력 ---
console.log(`\n제29조 문제: 총 ${(problems ?? []).length} (이미 지정 ${already} skip, 가분류 대상 ${candidates.length})`);
console.log(`분류됨 ${assignments.length} / 미분류(키워드 없음) ${unclassified.length} / 저신뢰(검토권장) ${lowConf.length}\n`);
for (const k of PRIORITY) {
  const arr = byCat[k];
  console.log(`■ ${NODES[k].label}: ${arr.length}건`);
  for (const r of arr.slice(0, 6)) console.log(`    ${r.tag}  score=${r.topScore} margin=${r.margin}  [${r.hits}]`);
  if (arr.length > 6) console.log(`    … 외 ${arr.length - 6}건`);
}
console.log(`\n■ 미분류(NULL 유지): ${unclassified.length}건  ${unclassified.slice(0, 20).join(" ")}${unclassified.length > 20 ? " …" : ""}`);
console.log(`\n■ 저신뢰(margin≤1 또는 score≤2) — 검토 권장: ${lowConf.length}건`);
for (const l of lowConf.slice(0, 25)) console.log(`    ${l}`);
if (lowConf.length > 25) console.log(`    … 외 ${lowConf.length - 25}건`);

if (!APPLY) { console.log(`\n[DRY-RUN] --apply 로 ${assignments.length}건 primary_node_id 반영.`); process.exit(0); }

// --- 적용 ---
let ok = 0;
for (const a of assignments) {
  const { error } = await sb
    .from("problems")
    .update({ primary_node_id: a.node_id, updated_at: new Date().toISOString() })
    .eq("problem_id", a.problem_id);
  if (error) console.error(`  ${a.problem_id} err ${error.message}`);
  else ok++;
}
console.log(`\n[APPLIED] ${ok}/${assignments.length} 반영.`);
