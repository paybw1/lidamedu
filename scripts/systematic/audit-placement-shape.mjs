// 조문 배치의 모양 점검 — 부모/자식 어디에 붙어 있어야 하는가. **읽기 전용**.
//
// 왜 중요한가: 객관식 지문의 단원 picker 는 **그 조문이 배치된 노드만** 후보로 준다
// (admin-problem-edit.tsx). 배치가 비면 그 항목은 지문 분류에서 아예 고를 수 없다.
// "제2조에 상표 외의 권리가 안 보인다"가 이 문제였다.
//
// 세 가지를 본다.
//   [중복] 부모에 붙은 조문이 자손에도 붙어 있다 → 부모 쪽이 군더더기
//   [미정] 부모에만 붙어 있고 자식 중 아무도 안 가졌다 → 어느 자식이 자리인지 사람이 정한다
//   [누락] 형제 다수가 가진 조문을 한 항목만 못 가졌다 → picker 후보에서 빠진다
//
//   node scripts/systematic/audit-placement-shape.mjs trademark
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const lawCode = process.argv[2];
if (!lawCode) {
  console.error("사용: node scripts/systematic/audit-placement-shape.mjs <law_code>");
  process.exit(1);
}

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, parent_id, path, ord, case_only")
  .eq("law_code", lawCode)
  .limit(3000);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));
const childrenOf = new Map();
for (const n of nodes) {
  const k = n.parent_id ?? "root";
  if (!childrenOf.has(k)) childrenOf.set(k, []);
  childrenOf.get(k).push(n);
}

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
const artOf = new Map();
for (let i = 0; i < artIds.length; i += 100) {
  const { data } = await sb
    .from("articles")
    .select("article_id, article_number")
    .in("article_id", artIds.slice(i, i + 100));
  (data ?? []).forEach((a) => artOf.set(a.article_id, String(a.article_number)));
}
const numsOf = new Map(); // node_id → Set(조번호)
for (const l of links) {
  if (!numsOf.has(l.node_id)) numsOf.set(l.node_id, new Set());
  const num = artOf.get(l.article_id);
  if (num) numsOf.get(l.node_id).add(num);
}

function chainOf(n) {
  const out = [];
  let cur = n;
  while (cur) {
    out.unshift(cur.display_label.replace(/^\s*\d{2}\s+/, "").trim());
    cur = cur.parent_id ? byId.get(cur.parent_id) : null;
  }
  return out.join(" > ");
}
/** 자손 전체(주제층 case_only 는 배치 대상이 아니라 제외). */
function descendants(n) {
  const out = [];
  const stack = [...(childrenOf.get(n.node_id) ?? [])];
  while (stack.length) {
    const c = stack.pop();
    if (c.case_only) continue;
    out.push(c);
    stack.push(...(childrenOf.get(c.node_id) ?? []));
  }
  return out;
}

const dup = [];
const undecided = [];
const gap = [];

for (const n of nodes) {
  if (n.case_only) continue;
  const mine = numsOf.get(n.node_id);
  const kids = (childrenOf.get(n.node_id) ?? []).filter((c) => !c.case_only);
  if (!kids.length) continue;

  const desc = descendants(n);
  if (mine) {
    for (const num of mine) {
      const holders = desc.filter((d) => numsOf.get(d.node_id)?.has(num));
      if (holders.length) {
        dup.push({ node: n, num, holders: holders.map((h) => h.display_label) });
      } else {
        undecided.push({ node: n, num, kids: kids.map((k) => k.display_label) });
      }
    }
  }

  // 형제 누락 — 자식 과반이 가진 조문을 못 가진 자식
  const tally = new Map();
  for (const k of kids) for (const num of numsOf.get(k.node_id) ?? []) tally.set(num, (tally.get(num) ?? 0) + 1);
  for (const [num, cnt] of tally) {
    if (cnt < 2 || cnt <= kids.length / 2) continue;
    const missing = kids.filter((k) => !numsOf.get(k.node_id)?.has(num));
    for (const m of missing) {
      gap.push({ parent: n, node: m, num, cnt, total: kids.length });
    }
  }
}

console.log(`\n=== ${lawCode} — 노드 ${nodes.length} · 배치 ${links.length}`);

console.log(`\n[중복] 부모에 붙었는데 자손도 가진 조문 — ${dup.length}건`);
dup.forEach((d) =>
  console.log(`   ${chainOf(d.node)}  제${d.num}조\n      └ 자손 보유: ${d.holders.join(", ")}`),
);

console.log(`\n[미정] 부모에만 붙어 자식 중 자리를 못 정한 조문 — ${undecided.length}건`);
undecided.forEach((u) =>
  console.log(`   ${chainOf(u.node)}  제${u.num}조\n      └ 자식: ${u.kids.join(", ")}`),
);

console.log(`\n[누락] 형제 다수가 가진 조문을 못 가진 항목 — ${gap.length}건`);
gap.forEach((g) =>
  console.log(
    `   ${chainOf(g.node)}  제${g.num}조 없음  (형제 ${g.cnt}/${g.total} 이 보유)`,
  ),
);
