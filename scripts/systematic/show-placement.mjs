// 체계도 한 가지(하위 트리)의 조문 배치를 본다. **읽기 전용**.
//
//   node scripts/systematic/show-placement.mjs trademark "등록요건 > 상표등록을 받을 수 있는 상표"
//   node scripts/systematic/show-placement.mjs trademark "총칙"          # 장 전체
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [lawCode, chainText] = process.argv.slice(2);
if (!lawCode || !chainText) {
  console.error(`사용: node scripts/systematic/show-placement.mjs <law> "가 > 나"`);
  process.exit(1);
}

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, case_display_label, case_only, parent_id, path, ord")
  .eq("law_code", lawCode)
  .limit(3000);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));
const kids = new Map();
for (const n of nodes) {
  const k = n.parent_id ?? "root";
  if (!kids.has(k)) kids.set(k, []);
  kids.get(k).push(n);
}

const key = (s) => s.replace(/^\s*\d{2}\s+/, "").replace(/\s+/g, "").trim();
function chainOf(n) {
  const out = [];
  let cur = n;
  while (cur) {
    out.unshift(cur.display_label.replace(/^\s*\d{2}\s+/, "").trim());
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return out;
}

const want = chainText.split(">").map(key);
const last = want[want.length - 1];
const roots = nodes.filter((n) => {
  if (key(n.display_label) !== last) return false;
  const have = chainOf(n).map(key);
  let i = 0;
  for (const w of want) {
    i = have.indexOf(w, i);
    if (i < 0) return false;
    i += 1;
  }
  return true;
});
if (!roots.length) throw new Error(`노드를 못 찾음: ${chainText}`);

// 배치는 한 번에 읽는다.
const ids = nodes.map((n) => n.node_id);
const links = [];
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await sb
    .from("article_systematic_links")
    .select("node_id, article_id")
    .in("node_id", ids.slice(i, i + 100));
  links.push(...(data ?? []));
}
const artIds = [...new Set(links.map((l) => l.article_id))];
const arts = new Map();
for (let i = 0; i < artIds.length; i += 100) {
  const { data } = await sb
    .from("articles")
    .select("article_id, article_number, display_label")
    .in("article_id", artIds.slice(i, i + 100));
  (data ?? []).forEach((a) => arts.set(a.article_id, a));
}
const byNode = new Map();
for (const l of links) {
  if (!byNode.has(l.node_id)) byNode.set(l.node_id, []);
  byNode.get(l.node_id).push(l.article_id);
}

function print(n, depth) {
  const list = (byNode.get(n.node_id) ?? [])
    .map((id) => arts.get(id))
    .filter(Boolean)
    .sort((a, b) => parseFloat(a.article_number) - parseFloat(b.article_number))
    .map((a) => `제${a.article_number}조`);
  const tag = n.case_only ? " [판례전용]" : "";
  const alt = n.case_display_label ? ` {판례명: ${n.case_display_label}}` : "";
  console.log(
    `${"  ".repeat(depth)}${n.display_label}${tag}${alt}` +
      (list.length ? `   → ${list.join(", ")}` : "   → (배치 없음)"),
  );
  (kids.get(n.node_id) ?? []).sort((a, b) => a.ord - b.ord).forEach((c) => print(c, depth + 1));
}

for (const r of roots) {
  console.log(`\n${chainOf(r).slice(0, -1).join(" / ")}`);
  print(r, 0);
}
