// 체계도 라벨의 `(法 101, 102, 103)` 표기를 **조문 배치로 옮긴다**.
//
//   "포기(法 101, 102, 103)"  →  라벨은 "포기", 그 아래에 제101·102·103조 연결
//
// ★원본(hwpx)의 괄호 표기는 **제목의 일부가 아니라 배치 지시**다. 라벨에 남겨 두면
//   수험생 화면에 조문번호가 그대로 노출되고, 정작 조문은 붙어 있지 않다.
// ★조문 연결은 조(article) 단위만 있다 — `88②`·`48②⑤` 같은 항 표시는 조로 접는다.
// ★기존 연결은 지우지 않는다. 사람이 붙여 둔 것일 수 있어, 원본에 없는 것은 '초과'로
//   보고만 하고 남긴다.
//
//   node scripts/systematic/apply-article-refs.mjs trademark
//   node scripts/systematic/apply-article-refs.mjs trademark --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const lawCode = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!lawCode) {
  console.error("사용: node scripts/systematic/apply-article-refs.mjs <law_code> [--apply]");
  process.exit(1);
}

// 항 표시(원문자)와 호 표시는 조 단위로 접는다.
const CIRCLED = /[①-⑳]/g;
// ★닫는 괄호가 빠진 원본이 실제로 있다(`실시권 일반(法 97, 98, 99, 104`).
//   `\)?` 로 받아 주지 않으면 그 노드만 조용히 누락된다.
const SUFFIX = /\s*\(\s*法\s*([^)]*)\)?\s*$/;

/** `104, 105` `60-66` `141의2` `48②⑤` `발진법 10①` → 조 번호 배열 + 건너뛴 토큰 */
function parseRefs(raw) {
  const nums = [];
  const skipped = [];
  for (const piece of raw.split(",")) {
    const t = piece.replace(CIRCLED, "").trim();
    if (!t) continue;
    // ★숫자 형식을 **먼저** 본다. 가지조문 `141의2` 에도 한글이 들어 있어, 다른 법
    //   판정(한글 포함)을 앞에 두면 정상 조문이 통째로 걸러진다.
    if (/^\d+(의\d+)?$/.test(t)) {
      nums.push(t);
      continue;
    }
    const range = t.match(/^(\d+)\s*[-~]\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to || to - from > 200) {
        skipped.push(piece.trim());
        continue;
      }
      for (let n = from; n <= to; n += 1) nums.push(String(n));
      continue;
    }
    // 남은 것은 다른 법의 조문(발명진흥법 등) — 이 법의 articles 에 없다.
    skipped.push(piece.trim());
  }
  return { nums: [...new Set(nums)], skipped };
}

const { data: law, error: lawErr } = await sb
  .from("laws")
  .select("law_id")
  .eq("law_code", lawCode)
  .maybeSingle();
if (lawErr) throw new Error(lawErr.message);
if (!law) throw new Error(`law_code 없음: ${lawCode}`);

const { data: nodes, error: nodeErr } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, case_display_label, path")
  .eq("law_code", lawCode)
  .limit(3000);
if (nodeErr) throw new Error(nodeErr.message);

const { data: articles, error: artErr } = await sb
  .from("articles")
  .select("article_id, article_number, display_label")
  .eq("law_id", law.law_id)
  .eq("level", "article")
  .is("deleted_at", null)
  .limit(2000);
if (artErr) throw new Error(artErr.message);
const byNumber = new Map(articles.map((a) => [String(a.article_number).trim(), a]));

const nodeIds = nodes.map((n) => n.node_id);
const existing = [];
for (let i = 0; i < nodeIds.length; i += 100) {
  const { data, error } = await sb
    .from("article_systematic_links")
    .select("node_id, article_id")
    .in("node_id", nodeIds.slice(i, i + 100));
  if (error) throw new Error(error.message);
  existing.push(...data);
}
const haveByNode = new Map();
for (const l of existing) {
  const s = haveByNode.get(l.node_id) ?? new Set();
  s.add(l.article_id);
  haveByNode.set(l.node_id, s);
}

const relabel = []; // {node_id, from, to}
const inserts = []; // {node_id, article_id}
const missing = []; // 원본이 가리키는데 articles 에 없는 조
const skippedAll = []; // 다른 법 조문 등
let extras = 0;

for (const n of nodes) {
  const m = (n.display_label ?? "").match(SUFFIX);
  if (!m) continue;
  const clean = n.display_label.replace(SUFFIX, "").trim();
  if (!clean) {
    console.log(`★건너뜀 — 괄호를 떼면 라벨이 빈다: ${n.display_label} (${n.path})`);
    continue;
  }
  relabel.push({ node_id: n.node_id, from: n.display_label, to: clean, path: n.path });

  const { nums, skipped } = parseRefs(m[1]);
  skipped.forEach((s) => skippedAll.push(`${clean}: ${s}`));
  const have = haveByNode.get(n.node_id) ?? new Set();
  const want = new Set();
  for (const num of nums) {
    const art = byNumber.get(num);
    if (!art) {
      missing.push(`${clean}: 제${num}조`);
      continue;
    }
    want.add(art.article_id);
    if (!have.has(art.article_id)) inserts.push({ node_id: n.node_id, article_id: art.article_id });
  }
  for (const id of have) if (!want.has(id)) extras += 1;
}

console.log(`\n=== ${lawCode} — 노드 ${nodes.length} · 조 ${articles.length}`);
console.log(`라벨 정리 ${relabel.length}건 · 조문 배치 추가 ${inserts.length}건 · 기존 유지(원본 밖) ${extras}건`);
relabel.slice(0, 6).forEach((r) => console.log(`   ${r.from}  →  ${r.to}`));
if (relabel.length > 6) console.log(`   … 외 ${relabel.length - 6}건`);
if (missing.length) {
  console.log(`\n★articles 에 없는 조 ${missing.length}건 — 배치 못 함:`);
  missing.slice(0, 20).forEach((s) => console.log(`   ${s}`));
  if (missing.length > 20) console.log(`   … 외 ${missing.length - 20}건`);
}
if (skippedAll.length) {
  console.log(`\n다른 법 조문 등 건너뜀 ${skippedAll.length}건:`);
  skippedAll.forEach((s) => console.log(`   ${s}`));
}

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

// ★되돌리기용 — inserts 목록이 곧 오늘 만든 링크의 delta 다. 이게 없으면 기존에
//   사람이 붙여 둔 연결과 오늘 것을 구별할 수 없다.
fs.mkdirSync("tmp/systematic", { recursive: true });
const stamp = `tmp/systematic/article-refs-${lawCode}.json`;
fs.writeFileSync(stamp, JSON.stringify({ lawCode, relabel, inserts }, null, 2));
console.log(`백업 저장 — ${stamp}`);

for (let i = 0; i < inserts.length; i += 200) {
  const { error } = await sb
    .from("article_systematic_links")
    .upsert(inserts.slice(i, i + 200), { onConflict: "node_id,article_id", ignoreDuplicates: true });
  if (error) throw new Error(`조문 배치 실패: ${error.message}`);
}
let done = 0;
for (const r of relabel) {
  const { error } = await sb
    .from("systematic_nodes")
    .update({ display_label: r.to })
    .eq("node_id", r.node_id);
  if (error) throw new Error(`라벨 실패 ${r.path}: ${error.message}`);
  done += 1;
}
console.log(`\n적용 완료 — 라벨 ${done}건 · 조문 배치 ${inserts.length}건`);
