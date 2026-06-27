// 번호겹침(같은 노드·출처·번호) 문제들을 워크북 chapter/section 으로 역매핑해 원인 진단.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const REF = "mcgdoplovrjgklbxmozi";
const tok = process.env.SUPABASE_ACCESS_TOKEN;
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

const meta = new Map();
for (const f of ["problems-merged.json", "expected-merged.json"]) {
  for (const p of JSON.parse(readFileSync(`source/_converted/${f}`, "utf8")).problems ?? []) {
    const bodies = (p.choices ?? []).map((c) => c.body ?? "");
    if (bodies.length) meta.set(sigOf(bodies), { ch: p.chapter, ct: p.chapterTitle, sec: p.section, stem: (p.stem ?? "").replace(/\s+/g, " ").slice(0, 38) });
  }
}

const nodes = ["침해에 대한 조치", "국내우선권주장출원", "보상금액 또는 대가에 대한 소송", "본안심리", "신규성", "실체보정"];
const inList = nodes.map((n) => `'${n}'`).join(",");
const rows = await mgmt(`select p.problem_id, sn.display_label nd, p.origin o, p.problem_number n, coalesce(string_agg(regexp_replace(c.body_md,'\\s+','','g'),'|' order by c.choice_index),'') csig from problems p join systematic_nodes sn on sn.node_id=p.primary_node_id join laws l on l.law_id=p.law_id left join problem_choices c on c.problem_id=p.problem_id where l.law_code='patent' and p.deleted_at is null and sn.display_label in (${inList}) group by p.problem_id, sn.display_label, p.origin, p.problem_number`);

const groups = {};
for (const r of rows) { const k = `${r.nd}|${r.o}|${r.n}`; (groups[k] ??= []).push(r); }
for (const [k, arr] of Object.entries(groups)) {
  if (arr.length < 2) continue;
  console.log(`\n[${k}]`);
  for (const r of arr) {
    const m = meta.get(createHash("md5").update(r.csig).digest("hex"));
    console.log(`  ${r.problem_id.slice(0, 8)} ch=${m?.ch ?? "?"}(${m?.ct ?? ""}) sec="${m?.sec ?? "?"}" — ${m?.stem ?? "(no wb match)"}`);
  }
}
