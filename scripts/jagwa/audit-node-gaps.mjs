// 단원별 번호-갭 전수 audit (읽기 전용). 워크북 섹션 1~N 중 DB 노드에 핀 안 된 번호를
// 본문 매칭으로 찾아, (a) 진짜 오배치(무관 노드) (b) 의도된 하위노드 (c) 미핀 (d) 누락 분류.
// path 기반: 현재 노드가 target 의 자손이면 의도된 정밀화(직무발명⊂특허받을권리 등) → 제외.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import "dotenv/config";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const norm = (s) => (s ?? "").replace(/\s+/g, "").trim();
const key = (s) => norm(s).slice(0, 36);

const { data: nodes } = await sb
  .from("systematic_nodes").select("node_id, display_label, path").eq("law_code", "patent");
const nodeById = Object.fromEntries(nodes.map((n) => [n.node_id, n]));
const byLabel = {};
for (const n of nodes) (byLabel[n.display_label] ??= []).push(n.node_id);

const dbProblems = [];
for (let from = 0; ; from += 1000) {
  const { data } = await sb
    .from("problems")
    .select("problem_id, problem_number, origin, primary_node_id, body_md, laws!inner(law_code)")
    .eq("laws.law_code", "patent").is("deleted_at", null).range(from, from + 999);
  if (!data?.length) break;
  dbProblems.push(...data);
  if (data.length < 1000) break;
}
const dbByKey = {};
for (const p of dbProblems) (dbByKey[key(p.body_md)] ??= []).push(p);

const load = (f) => {
  try { return JSON.parse(readFileSync(`source/_converted/${f}`, "utf8")).problems ?? []; }
  catch { return []; }
};
const sections = {};
for (const p of load("problems-merged.json")) {
  if (!p.section) continue;
  (sections[p.section] ??= { 기출: [], 예상: [] }).기출.push({ num: p.problemNumber, stem: p.stem || p.body || "" });
}
for (const p of load("expected-merged.json")) {
  if (!p.section) continue;
  (sections[p.section] ??= { 기출: [], 예상: [] }).예상.push({ num: p.problemNumber, stem: p.stem || p.body || "" });
}

const genuine = [], subnode = [], unpinned = [], missing = [];
let noNode = 0;
for (const [section, g] of Object.entries(sections)) {
  const ids = byLabel[section];
  if (!ids || ids.length !== 1) { noNode++; continue; }
  const nodeId = ids[0];
  const targetPath = nodeById[nodeId].path;
  for (const [grp, list] of [["기출", g.기출], ["예상", g.예상]]) {
    for (const wb of list) {
      const cands = dbByKey[key(wb.stem)] ?? [];
      if (cands.length === 0) { missing.push({ section, grp, num: wb.num, stem: norm(wb.stem).slice(0, 40) }); continue; }
      if (cands.some((c) => c.primary_node_id === nodeId)) continue; // 정확
      const cur = cands[0];
      const curNode = cur.primary_node_id ? nodeById[cur.primary_node_id] : null;
      if (!curNode) { unpinned.push({ section, grp, num: wb.num }); continue; }
      if (curNode.path && targetPath && curNode.path.startsWith(targetPath + ".")) {
        subnode.push({ section, grp, num: wb.num, sub: curNode.display_label }); continue; // 의도된 하위노드
      }
      genuine.push({ section, grp, num: wb.num, 現: curNode.display_label, stem: norm(wb.stem).slice(0, 40), pid: cur.problem_id.slice(0, 8) });
    }
  }
}

console.log(`섹션 ${Object.keys(sections).length}(매핑불가 ${noNode}) · 하위노드(의도)제외 ${subnode.length} · 미핀 ${unpinned.length} · 무매칭 ${missing.length}`);
console.log(`\n■■ 진짜 오배치(무관 노드 = #8/#15류, 재핀 대상) ${genuine.length}건 ■■`);
for (const m of genuine) console.log(`  [${m.section}] ${m.grp}#${m.num} → 현재 "${m.現}" | ${m.pid} | ${m.stem}`);
console.log(`\n■ 미핀(primary_node_id 없음, 파생노드 의존 — 별도 검토) ${unpinned.length}건`);
const byU = {};
for (const u of unpinned) (byU[u.section] ??= []).push(`${u.grp}#${u.num}`);
for (const [s, l] of Object.entries(byU)) console.log(`  [${s}] ${l.join(", ")}`);
console.log(`\n■ DB 본문 무매칭(누락 의심/본문상이) ${missing.length}건`);
for (const m of missing) console.log(`  [${m.section}] ${m.grp}#${m.num} | ${m.stem}`);

// --emit: 카테고리①(무관 노드) 재핀 worklist + SQL 생성. 의도된 하위노드 클러스터는 제외(②, 사용자 판단 대기).
if (process.argv.includes("--emit")) {
  const CLUSTER = new Set(["법정실시권", "직무발명", "출원의 취하, 포기에 의한 종료"]);
  const repin = [], cluster = [];
  for (const [section, g] of Object.entries(sections)) {
    const ids = byLabel[section];
    if (!ids || ids.length !== 1) continue;
    const nodeId = ids[0];
    const targetPath = nodeById[nodeId].path;
    for (const [grp, list] of [["기출", g.기출], ["예상", g.예상]]) {
      for (const wb of list) {
        const cands = dbByKey[key(wb.stem)] ?? [];
        if (cands.length === 0) continue;
        if (cands.some((c) => c.primary_node_id === nodeId)) continue;
        for (const c of cands) {
          if (c.primary_node_id === nodeId || !c.primary_node_id) continue;
          const cn = nodeById[c.primary_node_id];
          if (!cn) continue;
          if (cn.path && targetPath && cn.path.startsWith(targetPath + ".")) continue; // 하위노드(의도)
          const row = { section, grp, num: wb.num, problem_id: c.problem_id, from: cn.display_label, fromNodeId: c.primary_node_id, toNodeId: nodeId, candCount: cands.length, stem: norm(wb.stem).slice(0, 40) };
          (CLUSTER.has(cn.display_label) ? cluster : repin).push(row);
        }
      }
    }
  }
  console.log(`\n\n=== EMIT ===`);
  console.log(`① 재핀 대상(무관 노드, 클러스터 제외): ${repin.length}건`);
  const byFrom = {};
  for (const r of repin) (byFrom[r.from] ??= []).push(r);
  for (const [f, rows] of Object.entries(byFrom)) {
    console.log(`  ▸ 현재 "${f}" (${rows.length}): ${rows.map((r) => `[${r.section}]${r.grp}#${r.num}${r.candCount > 1 ? `(cand${r.candCount})` : ""}`).join(" / ")}`);
  }
  console.log(`\n② 클러스터(제외, 사용자 판단 대기): ${cluster.length}건`);
  const byC = {};
  for (const r of cluster) (byC[r.from] ??= []).push(r);
  for (const [f, rows] of Object.entries(byC)) console.log(`  ▸ "${f}" (${rows.length})`);
  const ambiguous = repin.filter((r) => r.candCount > 1);
  if (ambiguous.length) console.log(`\n⚠ 다중 매칭(cand>1) ${ambiguous.length}건 — SQL 제외, 수동 확인:\n${ambiguous.map((r) => `  ${r.problem_id.slice(0, 8)} [${r.section}]${r.grp}#${r.num} cand=${r.candCount}`).join("\n")}`);

  const safe = repin.filter((r) => r.candCount === 1);
  const lines = [
    "-- 카테고리① 무관-노드 오배치 재핀 (audit-node-gaps.mjs --emit 자동생성).",
    "-- 워크북 섹션이 정답 노드. 토픽과 무관한 포괄/오染 노드(보상금액소송·본안심리·행위능력 등)에 잘못 핀된 것을 섹션 노드로 복원.",
    "-- 의도된 하위노드(법정실시권·직무발명·취하포기)는 제외(②, 사용자 판단). 다중매칭(cand>1)도 제외.",
    "-- 롤백: 각 problem_id 를 주석의 from-노드로 복원.",
  ];
  for (const r of safe) {
    lines.push(`update problems set primary_node_id = '${r.toNodeId}', updated_at = now() where problem_id = '${r.problem_id}'; -- [${r.section}] ${r.grp}#${r.num}: "${r.from}"(${r.fromNodeId.slice(0, 8)}) → "${r.section}"`);
  }
  // 생성물 전용 경로(_ 접두) — 적용 완료 스냅샷(20260628_repin_category1_node_gaps.sql)을 덮어쓰지 않음.
  writeFileSync("scripts/sql/_repin_category1_generated.sql", lines.join("\n") + "\n");
  console.log(`\n✅ SQL ${safe.length}건 → scripts/sql/_repin_category1_generated.sql (생성물)`);
}
