// 도해 유닛 ↔ 체계도 노드 링크 시드 (dohae_unit_nodes).
// 원천 = scripts/dohae/node-mapping.json — 원장이 docx 대응표에 확정 기입한 것을
// tmp/dohae/merge-user-edits.mjs 로 병합한 결과(93유닛 전건 대응)를 옮겨 담은 것.
// ★tmp/ 는 gitignore 이므로 확정본은 반드시 이 파일로 유지한다(재현 가능해야 함).
// 멱등: 이 책(book_code) 유닛의 링크를 전량 삭제 후 재삽입.
//
//   node scripts/dohae/seed-dohae-nodes.mjs [--dry]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(import.meta.dirname, "../..");
const BOOK = "dohae_patent_20";
const LAW = "patent";
const DRY = process.argv.includes("--dry");

// 대응표에는 없지만 명백한 1:N 누락 — 도해 31 「심사관 및 전문기관」이 전문기관 노드에만
// 걸려 심사관 노드가 도해 0 이 된다(사용자 확인 2026-08-16, 도해 63 과 같은 유형).
const EXTRA = { 31: ["patent.b4.b1.b1"] };

const mapping = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "node-mapping.json"), "utf8"),
);

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 대응표의 유닛 표기("6" / "참고 1.3") → dohae_units.unit_key("t06" / "r1-3")
function unitKeyOf(unit) {
  const ref = /^참고\s*([\d.]+)$/.exec(unit);
  if (ref) return `r${ref[1].replace(".", "-")}`;
  const no = /^(\d+)$/.exec(unit);
  if (no) return `t${no[1].padStart(2, "0")}`;
  throw new Error(`유닛 표기를 해석할 수 없음: ${JSON.stringify(unit)}`);
}

const { data: units, error: uErr } = await supa
  .from("dohae_units")
  .select("unit_id, unit_key")
  .eq("book_code", BOOK);
if (uErr) throw uErr;
const unitId = new Map(units.map((u) => [u.unit_key, u.unit_id]));

const { data: nodes, error: nErr } = await supa
  .from("systematic_nodes")
  .select("node_id, path, display_label")
  .eq("law_code", LAW);
if (nErr) throw nErr;
const nodeId = new Map(nodes.map((n) => [String(n.path), n.node_id]));

const links = [];
const seen = new Set();
for (const row of mapping) {
  const key = unitKeyOf(row.unit);
  const id = unitId.get(key);
  if (!id) throw new Error(`dohae_units 에 없는 유닛: ${row.unit} (${key})`);
  const paths = [...new Set([...row.nodes, ...(EXTRA[row.unit] ?? [])])];
  if (paths.length === 0) throw new Error(`대응 노드 없는 유닛: ${row.unit} ${row.title}`);
  for (const p of paths) {
    const nid = nodeId.get(p);
    if (!nid) throw new Error(`systematic_nodes 에 없는 경로: ${p} (유닛 ${row.unit})`);
    const k = `${id}|${nid}`;
    if (seen.has(k)) continue;
    seen.add(k);
    links.push({ unit_id: id, node_id: nid });
  }
}

console.log(`유닛 ${mapping.length} · 링크 ${links.length} · 대상 노드 ${new Set(links.map((l) => l.node_id)).size}`);
if (DRY) {
  console.log("[dry] 삽입 생략");
  process.exit(0);
}

// 이 책 유닛의 기존 링크 전량 삭제 → 재삽입
{
  const ids = [...unitId.values()];
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await supa.from("dohae_unit_nodes").delete().in("unit_id", ids.slice(i, i + 100));
    if (error) throw new Error(`delete: ${error.message}`);
  }
}
for (let i = 0; i < links.length; i += 200) {
  const { error } = await supa.from("dohae_unit_nodes").insert(links.slice(i, i + 200));
  if (error) throw new Error(`insert: ${error.message}`);
}

const { count } = await supa
  .from("dohae_unit_nodes")
  .select("unit_id", { count: "exact", head: true });
console.log(`dohae_unit_nodes ${count}건 (기대 ${links.length})`);
if (count !== links.length) throw new Error("건수 불일치");

// ── 조문 보강 — 책 제목의 참조 표기는 축약이라 조문이 빠진다 ──────────────────
// 유닛의 조문은 제목의 "(法 3~5①)" 같은 표기에서 뽑는데, 이건 대표 조문만 든 축약이다.
// 그래서 체계도 노드에는 있는 조문이 도해에선 빠져 보인다(행위능력의 제7조의2 등,
// 원장 신고 2026-08-17). 노드에 유닛이 **하나뿐**이면 그 노드의 조문이 곧 그 주제의
// 조문이므로, 책 표기에 **더해서**(빼지 않고) 채운다.
// ★유닛이 여럿 얹힌 노드는 건너뛴다 — 그 노드 조문 전체를 각 유닛에 주면
//   "재외자의 재판관할"에 대리인 노드 조문이 통째로 붙는 식으로 과다 포섭된다.
{
  const unitsOnNode = new Map(); // node_id → unit_id[]
  for (const l of links) {
    const arr = unitsOnNode.get(l.node_id) ?? [];
    arr.push(l.unit_id);
    unitsOnNode.set(l.node_id, arr);
  }
  const soleNodes = [...unitsOnNode.entries()].filter(([, us]) => us.length === 1);

  const { data: nodeLinks, error: nlErr } = await supa
    .from("article_systematic_links")
    .select("node_id, article_id")
    .in("node_id", soleNodes.map(([n]) => n));
  if (nlErr) throw nlErr;
  const articlesByNode = new Map();
  for (const r of nodeLinks ?? []) {
    const arr = articlesByNode.get(r.node_id) ?? [];
    arr.push(r.article_id);
    articlesByNode.set(r.node_id, arr);
  }

  const { data: existing, error: exErr } = await supa
    .from("dohae_unit_articles")
    .select("unit_id, article_id");
  if (exErr) throw exErr;
  const have = new Set((existing ?? []).map((r) => `${r.unit_id}|${r.article_id}`));

  const add = [];
  const perUnit = [];
  for (const [nodeId, [uid]] of soleNodes) {
    const arts = articlesByNode.get(nodeId) ?? [];
    const missing = arts.filter((aid) => !have.has(`${uid}|${aid}`));
    if (missing.length === 0) continue;
    perUnit.push({ uid, n: missing.length });
    for (const aid of missing) add.push({ unit_id: uid, article_id: aid });
  }
  console.log(`조문 보강 — 유닛 ${perUnit.length}개에 ${add.length}건 추가(노드 배치 기준)`);
  for (let i = 0; i < add.length; i += 200) {
    const { error } = await supa.from("dohae_unit_articles").insert(add.slice(i, i + 200));
    if (error) throw new Error(`보강 insert: ${error.message}`);
  }
  const { count: total } = await supa
    .from("dohae_unit_articles")
    .select("unit_id", { count: "exact", head: true });
  console.log(`dohae_unit_articles ${total}건`);
}
