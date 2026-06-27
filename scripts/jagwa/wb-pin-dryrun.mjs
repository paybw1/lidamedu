// 워크북 section(정답 단원) 기준으로 특허 문제의 primary_node_id 를 재배치하는 DRY-RUN.
//   - 워크북 문제(기출Ⅰ+예상Ⅱ) → section → systematic node 매핑
//   - 워크북문제 ↔ DB문제 = 선지 시그니처(choice bodies, index순, 공백제거 md5)로 매칭
//   - DB 현재 primary_node_id 와 비교해 변경 대상 worklist 생성 (적용 안 함)
//   out: scripts/jagwa/.factbox/wb-node-worklist.json
import "dotenv/config";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function mgmt(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const norm = (s) => (s ?? "").replace(/\s+/g, "").trim();
const sigOf = (bodies) => createHash("md5").update(bodies.map(norm).join("|")).digest("hex");

// 1) 노드 맵 + section→node
const { data: nodes } = await sb
  .from("systematic_nodes").select("node_id, display_label, path").eq("law_code", "patent");
const byLabel = {}, byPath = {};
for (const n of nodes) { (byLabel[n.display_label] ??= []).push(n); byPath[n.path] = n; }

// 중복 라벨(심판) → 각론/본안 노드 path 로 해소
const AMBIG = {
  "본안심리": "patent.b6.b3.b2",
  "특허무효심판": "patent.b6.b6.b2",
  "권리범위확인심판": "patent.b6.b6.b4",
};
// 라벨 불일치 → path 별칭
const ALIAS = {
  "공지예외적용주장출원": "patent.b3.b1",
  "심사의 진행": "patent.b4.b3",
  "심사일반 및 심사의 주체": "patent.b4.b1",
  "특허권의 소멸 및 특허권자의 의무": "patent.b5.b4",
  "심판의 청구": "patent.b6.b2",
  "정정심판": "patent.b6.b6.b5",
  "정정청구": "patent.b6.b6.b5",
  "조약": "patent.b10", // 10 국제조약 (사용자 결정)
  "실용신안": "patent.b9",
  "복수당사자 대표": "patent.b1.b5",
  "조정위윈회 회부": "patent.b6.b5.b1",
  "명세서의 기재방법": "patent.b2.b4.b3", // 신설 노드 (사용자 결정)
};

function sectionToNode(section) {
  if (!section) return null;
  if (AMBIG[section]) return byPath[AMBIG[section]] ?? null;
  if (ALIAS[section]) return byPath[ALIAS[section]] ?? null;
  const m = byLabel[section];
  return m && m.length === 1 ? m[0] : null;
}

// 2) 워크북 → sig→{node, section}
const load = (f) => { try { return JSON.parse(readFileSync(`source/_converted/${f}`, "utf8")).problems ?? []; } catch { return []; } };
const wb = [...load("problems-merged.json"), ...load("expected-merged.json")];
const wbBySig = new Map();
let noSection = 0, noNode = 0, sigCollision = 0;
for (const p of wb) {
  let node = sectionToNode(p.section);
  if (!p.section) { noSection++; continue; }
  if (!node) { noNode++; continue; }
  // 종료 단원: 워크북 파서가 출원 취하/포기를 "특허여부결정에 의한 종료"로 거칠게 묶음 →
  // 취하/포기 절차 문제(발문 앞부분에 취하/포기)는 "출원의 취하, 포기에 의한 종료"로 분리(사용자 결정).
  if (node.path === "patent.b4.b4.b1" && /^.{0,22}(취하|포기)/.test((p.stem ?? "").replace(/\s/g, ""))) {
    node = byPath["patent.b4.b4.b2"] ?? node;
  }
  const bodies = (p.choices ?? []).map((c) => c.body ?? "");
  if (bodies.length === 0) continue;
  const sig = sigOf(bodies);
  const prev = wbBySig.get(sig);
  if (prev && prev.nodeId !== node.node_id) sigCollision++;
  wbBySig.set(sig, { nodeId: node.node_id, label: node.display_label, section: p.section });
}

// 3) DB 특허 문제 + 선지 sig
const dbRows = await mgmt(`
  select p.problem_id, p.primary_node_id, p.problem_number,
    coalesce(string_agg(regexp_replace(c.body_md,'\\s+','','g'),'|' order by c.choice_index),'') as csig_raw
  from problems p join laws l on l.law_id=p.law_id
  left join problem_choices c on c.problem_id=p.problem_id
  where l.law_code='patent' and p.deleted_at is null
  group by p.problem_id, p.primary_node_id, p.problem_number`);

let matched = 0, change = 0, already = 0, noMatch = 0;
const work = [];
for (const r of dbRows) {
  const sig = createHash("md5").update(r.csig_raw).digest("hex");
  const wbHit = wbBySig.get(sig);
  if (!wbHit) { noMatch++; continue; }
  matched++;
  if (r.primary_node_id === wbHit.nodeId) { already++; continue; }
  change++;
  work.push({ problemId: r.problem_id, problemNumber: r.problem_number, current: r.primary_node_id, target: wbHit.nodeId, targetLabel: wbHit.label, section: wbHit.section });
}

mkdirSync("scripts/jagwa/.factbox", { recursive: true });
writeFileSync("scripts/jagwa/.factbox/wb-node-worklist.json", JSON.stringify(work, null, 2));

console.log(`워크북 ${wb.length} (no-section ${noSection} / no-node ${noNode} / sig충돌 ${sigCollision})`);
console.log(`DB 특허 ${dbRows.length}`);
console.log(`매칭 ${matched} / 변경대상 ${change} / 이미정확 ${already} / DB무매칭 ${noMatch}`);
// target 노드별 변경 분포 top
const byTarget = {};
for (const w of work) byTarget[w.targetLabel] = (byTarget[w.targetLabel] ?? 0) + 1;
console.log("변경 대상 노드 top:", JSON.stringify(Object.entries(byTarget).sort((a, b) => b[1] - a[1]).slice(0, 15)));
