// article-ref-overrides.json 의 키를 path → node_id 로 옮긴다. **1회용**.
//
// ★path 는 트리 위치에서 파생된다 — 묶음 하나를 걷어내면 아래가 전부 바뀐다.
//   실제로 총칙 규정·보칙 규정을 걷어낸 뒤 예외 3건이 조용히 무력화됐다(2026-09-04).
//   node_id 는 이름·부모·경로가 바뀌어도 그대로다.
//
//   node scripts/systematic/migrate-overrides-to-nodeid.mjs
//   node scripts/systematic/migrate-overrides-to-nodeid.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const FILE = "scripts/systematic/article-ref-overrides.json";
const APPLY = process.argv.includes("--apply");

// 옛 path → 지금의 노드를 찾을 라벨 사슬. 트리가 바뀐 것들만 손으로 적는다.
const REMAP = {
  "trademark.b1.b1.b2": ["01 총칙/보칙", "정의"],
  "trademark.b1.b1.b1": ["01 총칙/보칙", "목적"],
  "trademark.b1.b1.b1.b1": ["01 총칙/보칙", "목적", "상표법의 목적"],
  "design.b1.b1.b2": ["01 총칙/보칙", "정의"],
  // 보칙 규정은 사라졌다 — 원본 표기가 자식(보칙)에 있어 예외가 필요 없다.
  "trademark.b1.b2": null,
};

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, law_code, display_label, parent_id, path")
  .in("law_code", ["trademark", "design"])
  .limit(6000);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));
const chainOf = (n) => {
  const out = [];
  let cur = n;
  while (cur) {
    out.unshift(cur.display_label);
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return out;
};
const eq = (a, b) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

function resolve(oldPath, law) {
  if (oldPath in REMAP) {
    const chain = REMAP[oldPath];
    if (!chain) return null; // 의도적으로 버리는 항목
    const hits = nodes.filter(
      (n) =>
        n.law_code === law &&
        chainOf(n).length === chain.length &&
        chainOf(n).every((s, i) => eq(s, chain[i])),
    );
    if (hits.length !== 1) throw new Error(`사슬로 하나를 못 정함: ${chain.join(" / ")} (${hits.length})`);
    return hits[0];
  }
  const hit = nodes.find((n) => String(n.path) === oldPath);
  if (!hit) throw new Error(`path 로 못 찾음: ${oldPath}`);
  return hit;
}

const doc = JSON.parse(fs.readFileSync(FILE, "utf8"));
const out = [];
for (const o of doc.overrides) {
  const law = String(o.path).split(".")[0];
  const node = resolve(o.path, law);
  if (!node) {
    console.log(`버림 — ${o.label} (${o.path})`);
    continue;
  }
  const dest = o.moveTo ? resolve(o.moveTo, law) : null;
  console.log(
    `${chainOf(node).join(" / ")}  [${o.articles.join(", ")}]${dest ? `  → ${dest.display_label}` : ""}`,
  );
  out.push({
    nodeId: node.node_id,
    law,
    label: chainOf(node).join(" / "),
    articles: o.articles,
    moveToNodeId: dest ? dest.node_id : null,
    moveToLabel: dest ? chainOf(dest).join(" / ") : null,
    reason: o.reason,
  });
}

doc._설명 = [
  "원본 체계도의 (法 …) 표기를 그대로 배치하면 안 되는 예외.",
  "★여기 적어 두지 않으면 apply-article-refs 를 다시 돌릴 때 되살아난다.",
  "",
  "★키는 node_id 다(path 아님). path 는 트리 위치에서 파생돼, 묶음 하나를 걷어내면",
  "  아래가 전부 바뀐다 — 실제로 그 때문에 예외 3건이 조용히 무력화됐다(2026-09-04).",
  "  label 은 사람이 읽기 위한 것이고 판정에 쓰이지 않는다.",
  "",
  "articles      = 그 노드에 배치하지 않을 조 번호",
  "moveToNodeId  = 대신 배치할 노드. 없으면 배치하지 않고 끝낸다.",
];
doc.overrides = out;

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}
fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + "\n");
console.log(`\n적용 완료 — ${out.length}건`);
