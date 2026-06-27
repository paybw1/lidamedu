// 워크북 재파싱(번호 리셋 = 단원 경계) 기반 재매핑 DRY-RUN.
//   - 파서가 병합한 단원: 한 section 안에서 problemNumber 가 리셋되면 새 run.
//   - run_k(k번째 run) → section 노드의 트리 형제 중 k칸 뒤 노드(실시권일반→법정실시권 등).
//   - 워크북문제↔DB = 선지 시그니처. DB 현재 primary_node_id 와 비교 → worklist.
//   out: scripts/jagwa/.factbox/wb-node-worklist2.json
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function mgmt(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
const norm = (s) => (s ?? "").replace(/\s+/g, "").trim();
const sigOf = (bodies) => createHash("md5").update(bodies.map(norm).join("|")).digest("hex");

const { data: nodes } = await sb.from("systematic_nodes").select("node_id, display_label, path, parent_id, ord").eq("law_code", "patent");
const byLabel = {}, byPath = {}, childrenByParent = {};
for (const n of nodes) { (byLabel[n.display_label] ??= []).push(n); byPath[n.path] = n; (childrenByParent[n.parent_id] ??= []).push(n); }
for (const k in childrenByParent) childrenByParent[k].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || String(a.path).localeCompare(String(b.path)));

const AMBIG = { "본안심리": "patent.b6.b3.b2", "특허무효심판": "patent.b6.b6.b2", "권리범위확인심판": "patent.b6.b6.b4" };
const ALIAS = {
  "공지예외적용주장출원": "patent.b3.b1", "심사의 진행": "patent.b4.b3", "심사일반 및 심사의 주체": "patent.b4.b1",
  "특허권의 소멸 및 특허권자의 의무": "patent.b5.b4", "심판의 청구": "patent.b6.b2", "정정심판": "patent.b6.b6.b5",
  "정정청구": "patent.b6.b6.b5", "조약": "patent.b10", "실용신안": "patent.b9", "복수당사자 대표": "patent.b1.b5",
  "조정위윈회 회부": "patent.b6.b5.b1", "명세서의 기재방법": "patent.b2.b4.b3",
};
function sectionToNode(section) {
  if (!section) return null;
  if (AMBIG[section]) return byPath[AMBIG[section]] ?? null;
  if (ALIAS[section]) return byPath[ALIAS[section]] ?? null;
  const m = byLabel[section];
  return m && m.length === 1 ? m[0] : null;
}
function siblingOffset(node, k) {
  if (k === 0) return node;
  const sibs = childrenByParent[node.parent_id] ?? [];
  const idx = sibs.findIndex((s) => s.node_id === node.node_id);
  return idx >= 0 && sibs[idx + k] ? sibs[idx + k] : null;
}

// 워크북 → sig→node (책별 순서대로 run 분리)
const wbBySig = new Map();
const splitLog = {}; // 병합 section 의 run별 노드/건수 기록
let noSection = 0, noNode = 0;
for (const file of ["problems-merged.json", "expected-merged.json"]) {
  const probs = JSON.parse(readFileSync(`source/_converted/${file}`, "utf8")).problems ?? [];
  const bySec = new Map();
  for (const p of probs) { if (!bySec.has(p.section ?? "")) bySec.set(p.section ?? "", []); bySec.get(p.section ?? "").push(p); }
  for (const [sec, arr] of bySec) {
    if (!sec) { noSection += arr.length; continue; }
    const base = sectionToNode(sec);
    if (!base) { noNode += arr.length; continue; }
    let runIdx = 0, prev = -1;
    for (const p of arr) {
      if (p.problemNumber <= prev) runIdx++;
      prev = p.problemNumber;
      const node = siblingOffset(base, runIdx) ?? base;
      if (runIdx > 0) { const key = `${file}|${sec}→${node.display_label}`; splitLog[key] = (splitLog[key] ?? 0) + 1; }
      const bodies = (p.choices ?? []).map((c) => c.body ?? "");
      if (bodies.length === 0) continue;
      wbBySig.set(sigOf(bodies), { nodeId: node.node_id, label: node.display_label });
    }
  }
}

const dbRows = await mgmt(`select p.problem_id, p.primary_node_id, coalesce(string_agg(regexp_replace(c.body_md,'\\s+','','g'),'|' order by c.choice_index),'') csig_raw from problems p join laws l on l.law_id=p.law_id left join problem_choices c on c.problem_id=p.problem_id where l.law_code='patent' and p.deleted_at is null group by p.problem_id, p.primary_node_id`);
let matched = 0, change = 0, already = 0, noMatch = 0;
const work = [];
for (const r of dbRows) {
  const hit = wbBySig.get(createHash("md5").update(r.csig_raw).digest("hex"));
  if (!hit) { noMatch++; continue; }
  matched++;
  if (r.primary_node_id === hit.nodeId) { already++; continue; }
  change++;
  work.push({ problemId: r.problem_id, current: r.primary_node_id, target: hit.nodeId, targetLabel: hit.label });
}
writeFileSync("scripts/jagwa/.factbox/wb-node-worklist2.json", JSON.stringify(work, null, 2));
console.log(`매칭 ${matched} / 변경 ${change} / 이미정확 ${already} / 무매칭 ${noMatch} (no-section ${noSection}, no-node ${noNode})`);
console.log("\n병합 단원 run2+ 분리(→ 형제 노드):");
for (const [k, v] of Object.entries(splitLog)) console.log(`  ${k}: ${v}`);
