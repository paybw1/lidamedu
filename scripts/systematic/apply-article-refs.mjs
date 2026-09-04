// 체계도 원본의 `(法 101, 102, 103)` 표기를 **조문 배치로 옮긴다**.
//
//   "포기(法 101, 102, 103)"  →  라벨은 "포기", 그 아래에 제101·102·103조 연결
//
// ★번호는 **원본에서 읽는다**(DB 라벨 아님). 라벨의 접미는 이미 떼어냈으므로 DB 를
//   읽으면 아무것도 못 찾는다 — 처음엔 그렇게 만들었다가 재실행이 무의미해졌다.
// ★조문 연결은 조(article) 단위만 있다 — `88②`·`48②⑤` 같은 항 표시는 조로 접는다.
// ★기존 연결은 지우지 않는다. 사람이 붙여 둔 것일 수 있어, 원본에 없는 것은 '초과'로
//   보고만 하고 남긴다.
// ★운영자가 화면에서 옮기거나 지운 배치는 article-ref-overrides.json 에 기록돼 있고
//   여기서 그대로 존중한다. 없으면 재실행 때마다 그 결정이 되살아난다.
//
//   node scripts/systematic/apply-article-refs.mjs trademark
//   node scripts/systematic/apply-article-refs.mjs trademark --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { SOURCES, dbPathOf, keyPath, parseTree, stripRefs } from "./lib/source-tree.mjs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OVERRIDES_FILE = "scripts/systematic/article-ref-overrides.json";

const lawCode = process.argv[2];
const APPLY = process.argv.includes("--apply");
const src = SOURCES[lawCode];
if (!src) {
  console.error(
    `사용: node scripts/systematic/apply-article-refs.mjs <${Object.keys(SOURCES).join("|")}> [--apply]`,
  );
  process.exit(1);
}

// 항 표시(원문자)는 조 단위로 접는다.
const CIRCLED = /[①-⑳]/g;

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

// ── 원본 ───────────────────────────────────────────────────────────────────
// 조문용이 기준. 판례/객관식용에만 있는 표기는 보태 준다.
const wantByKey = new Map(); // keyPath → { refs, label }
for (const file of [src.article, src.caseView]) {
  for (const n of parseTree(file, lawCode)) {
    if (!n.refs) continue;
    const k = keyPath(n.path);
    if (!wantByKey.has(k)) wantByKey.set(k, { refs: n.refs, label: stripRefs(n.label) });
  }
}

// ── 예외 목록 ──────────────────────────────────────────────────────────────
// ★키는 node_id 다. path 로 잡으면 묶음 하나만 걷어내도 아래 경로가 전부 바뀌어
//   예외가 조용히 무력화된다(2026-09-04 실제 사고).
const OVERRIDES = new Map(); // `${node_id}|${조번호}` → 옮길 node_id(없으면 null)
for (const o of JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")).overrides) {
  for (const num of o.articles) OVERRIDES.set(`${o.nodeId}|${num}`, o.moveToNodeId ?? null);
}

// ── DB ─────────────────────────────────────────────────────────────────────
const { data: law, error: lawErr } = await sb
  .from("laws")
  .select("law_id")
  .eq("law_code", lawCode)
  .maybeSingle();
if (lawErr) throw new Error(lawErr.message);
if (!law) throw new Error(`law_code 없음: ${lawCode}`);

const { data: nodes, error: nodeErr } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, parent_id, path")
  .eq("law_code", lawCode)
  .limit(3000);
if (nodeErr) throw new Error(nodeErr.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));
const nodeByKey = new Map();
for (const n of nodes) {
  const k = keyPath(dbPathOf(n, byId));
  if (!nodeByKey.has(k)) nodeByKey.set(k, n);
}
const nodeById = new Map(nodes.map((n) => [n.node_id, n]));

const { data: articles, error: artErr } = await sb
  .from("articles")
  .select("article_id, article_number")
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
  if (!haveByNode.has(l.node_id)) haveByNode.set(l.node_id, new Set());
  haveByNode.get(l.node_id).add(l.article_id);
}

// ── 대조 ───────────────────────────────────────────────────────────────────
const inserts = [];
const seen = new Set(); // `${node_id}|${article_id}` — 같은 배치를 두 번 넣지 않는다
const missingNode = []; // 원본엔 있는데 DB 트리에 없는 항목
const missingArticle = []; // 가리키는 조가 articles 에 없음
const skippedAll = []; // 다른 법 조문 등
const overridden = []; // 예외 목록으로 빼거나 옮긴 배치
const wantByNode = new Map(); // node_id → Set(article_id) — '초과' 판정용

function plan(nodeId, articleId) {
  const k = `${nodeId}|${articleId}`;
  if (seen.has(k)) return;
  seen.add(k);
  if (!(haveByNode.get(nodeId) ?? new Set()).has(articleId))
    inserts.push({ node_id: nodeId, article_id: articleId });
}

for (const [k, want] of wantByKey) {
  const node = nodeByKey.get(k);
  if (!node) {
    missingNode.push(`${want.label} — ${k}`);
    continue;
  }
  const { nums, skipped } = parseRefs(want.refs);
  skipped.forEach((s) => skippedAll.push(`${want.label}: ${s}`));
  if (!wantByNode.has(node.node_id)) wantByNode.set(node.node_id, new Set());

  for (const num of nums) {
    const art = byNumber.get(num);
    if (!art) {
      missingArticle.push(`${want.label}: 제${num}조`);
      continue;
    }
    const ovKey = `${node.node_id}|${num}`;
    if (OVERRIDES.has(ovKey)) {
      const moveTo = OVERRIDES.get(ovKey);
      if (!moveTo) {
        overridden.push(`${want.label}: 제${num}조 — 배치 안 함`);
        continue;
      }
      const dest = nodeById.get(moveTo);
      if (!dest) {
        overridden.push(`★${want.label}: 제${num}조 — 옮길 노드 없음(${moveTo})`);
        continue;
      }
      overridden.push(`${want.label}: 제${num}조 → ${dest.display_label}`);
      if (!wantByNode.has(dest.node_id)) wantByNode.set(dest.node_id, new Set());
      wantByNode.get(dest.node_id).add(art.article_id);
      plan(dest.node_id, art.article_id);
      continue;
    }
    wantByNode.get(node.node_id).add(art.article_id);
    plan(node.node_id, art.article_id);
  }
}

// 원본이 가리키지 않는 기존 배치 — 지우지 않고 세기만 한다.
let extras = 0;
for (const [nodeId, have] of haveByNode) {
  const want = wantByNode.get(nodeId);
  for (const id of have) if (!want || !want.has(id)) extras += 1;
}

// 라벨에 접미가 남아 있으면(원본을 다시 넣은 경우 등) 함께 정리한다.
const relabel = nodes
  .filter((n) => stripRefs(n.display_label) !== n.display_label)
  .map((n) => ({ node_id: n.node_id, from: n.display_label, to: stripRefs(n.display_label) }));

console.log(`\n=== ${src.label}(${lawCode}) — 노드 ${nodes.length} · 조 ${articles.length}`);
console.log(`원본에서 읽은 배치 지시 ${wantByKey.size}건`);
console.log(`조문 배치 추가 ${inserts.length}건 · 라벨 정리 ${relabel.length}건 · 기존 유지(원본 밖) ${extras}건`);
if (overridden.length) {
  console.log(`\n예외 목록 적용 ${overridden.length}건:`);
  overridden.forEach((x) => console.log(`   ${x}`));
}
if (missingNode.length) {
  console.log(`\n★원본에 있으나 DB 트리에 없는 항목 ${missingNode.length}건 — 배치 못 함:`);
  missingNode.slice(0, 15).forEach((s) => console.log(`   ${s}`));
  if (missingNode.length > 15) console.log(`   … 외 ${missingNode.length - 15}건`);
}
if (missingArticle.length) {
  console.log(`\n★articles 에 없는 조 ${missingArticle.length}건:`);
  missingArticle.slice(0, 15).forEach((s) => console.log(`   ${s}`));
}
if (skippedAll.length) {
  console.log(`\n다른 법 조문 등 건너뜀 ${skippedAll.length}건:`);
  skippedAll.forEach((s) => console.log(`   ${s}`));
}

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

fs.mkdirSync("tmp/systematic", { recursive: true });
const stamp = `tmp/systematic/article-refs-${lawCode}.json`;
// ★되돌리기용 — inserts 목록이 곧 이번에 만든 링크의 delta 다. 이게 없으면 기존에
//   사람이 붙여 둔 연결과 이번 것을 구별할 수 없다.
fs.writeFileSync(stamp, JSON.stringify({ lawCode, relabel, inserts }, null, 2));
console.log(`백업 저장 — ${stamp}`);

for (let i = 0; i < inserts.length; i += 200) {
  const { error } = await sb
    .from("article_systematic_links")
    .upsert(inserts.slice(i, i + 200), { onConflict: "node_id,article_id", ignoreDuplicates: true });
  if (error) throw new Error(`조문 배치 실패: ${error.message}`);
}
for (const r of relabel) {
  const { error } = await sb
    .from("systematic_nodes")
    .update({ display_label: r.to })
    .eq("node_id", r.node_id);
  if (error) throw new Error(`라벨 실패 ${r.from}: ${error.message}`);
}
console.log(`\n적용 완료 — 조문 배치 ${inserts.length}건 · 라벨 ${relabel.length}건`);
