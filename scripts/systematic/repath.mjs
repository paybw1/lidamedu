// 체계도 path 재계산. 트리 구조(parent_id·ord)를 정답으로 보고 ltree path 를 다시 쓴다.
//
// ★path 는 트리거가 아니라 애플리케이션이 관리한다. 부모를 옮기면 자손 path 가 전부
//   어긋나므로, 이동 뒤에는 반드시 법 전체를 다시 계산해야 한다.
// ★두 번 돌려도 같은 결과가 나온다(멱등). 먼저 dry-run 으로 어긋난 수를 본다.
//
//   node scripts/systematic/repath.mjs design
//   node scripts/systematic/repath.mjs design --apply
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const lawCode = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!lawCode) {
  console.error("사용: node scripts/systematic/repath.mjs <law_code> [--apply]");
  process.exit(1);
}

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, parent_id, path, ord, case_only, display_label")
  .eq("law_code", lawCode)
  .limit(2000);
if (error) throw new Error(error.message);

const kids = new Map();
for (const n of nodes) {
  const k = n.parent_id ?? "__root__";
  const arr = kids.get(k) ?? [];
  arr.push(n);
  kids.set(k, arr);
}

// 목표 path 를 **전부 메모리에서 먼저 계산**한다. DB 를 오가며 계산하면 중간 상태가
// 섞여 부모는 새 경로, 자식은 옛 경로가 되는 일이 생긴다(실제로 그렇게 어긋났다).
const wanted = new Map();
function walk(parentKey, prefix) {
  const arr = (kids.get(parentKey) ?? []).slice().sort((a, b) => {
    if (a.ord !== b.ord) return a.ord - b.ord;
    return a.node_id.localeCompare(b.node_id); // ord 가 같으면 안정적으로
  });
  let b = 0;
  let t = 0;
  for (const n of arr) {
    // 주제 노드는 `t{n}`, 나머지는 `b{n}` — 기존 표기 규칙을 지킨다.
    const isTopic = n.case_only && /\.t\d+$/.test(n.path ?? "");
    const seg = isTopic ? `t${++t}` : `b${++b}`;
    const next = `${prefix}.${seg}`;
    wanted.set(n.node_id, next);
    walk(n.node_id, next);
  }
}
walk("__root__", lawCode);

const changes = nodes.filter((n) => wanted.get(n.node_id) && n.path !== wanted.get(n.node_id));
const unreached = nodes.filter((n) => !wanted.has(n.node_id));

console.log(`\n${lawCode} — ${nodes.length}노드 · 경로 변경 ${changes.length} · 트리에서 못 닿은 노드 ${unreached.length}`);
if (unreached.length) {
  console.log("★못 닿은 노드(부모 사슬이 끊김):");
  unreached.slice(0, 10).forEach((n) => console.log(`   ${n.display_label} (${n.path})`));
}
changes.slice(0, 8).forEach((n) => console.log(`   ${n.path}  →  ${wanted.get(n.node_id)}`));
if (changes.length > 8) console.log(`   … 외 ${changes.length - 8}건`);

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

// ★충돌 회피 — path 에 UNIQUE 가 걸려 있으면 중간에 겹칠 수 있다. 임시 경로로 한 번
//   비켜 놓고 최종 경로를 쓴다.
let n1 = 0;
for (const n of changes) {
  const { error: e } = await sb
    .from("systematic_nodes")
    .update({ path: `${lawCode}.stage${n1}` })
    .eq("node_id", n.node_id);
  if (e) throw new Error(`임시 경로 실패 ${n.node_id}: ${e.message}`);
  n1 += 1;
}
let n2 = 0;
for (const n of changes) {
  const { error: e } = await sb
    .from("systematic_nodes")
    .update({ path: wanted.get(n.node_id) })
    .eq("node_id", n.node_id);
  if (e) throw new Error(`최종 경로 실패 ${n.node_id}: ${e.message}`);
  n2 += 1;
}
console.log(`\n적용 완료 — ${n2}건 재계산`);
