// label-overrides.json 의 이름 규칙을 **DB 에 반영**한다.
//
// ★파서 쪽만 바꾸면 원본↔DB 짝이 어긋난다. apply-tree 는 이름으로 대조하므로
//   DB 가 옛 이름이면 "새 노드 9개 추가 + 옛 노드 9개 삭제"로 판단한다. 노드 id 가
//   갈리면 거기 붙은 콘텐츠 참조가 끊긴다. 그래서 **이름만 제자리에서 바꾼다.**
//
// 두 번 돌려도 안전하다(이미 바뀐 것은 건너뛴다).
//
//   node scripts/systematic/rename-nodes.mjs trademark
//   node scripts/systematic/rename-nodes.mjs trademark --apply
import "dotenv/config";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const lawCode = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!lawCode) {
  console.error("사용: node scripts/systematic/rename-nodes.mjs <law_code> [--apply]");
  process.exit(1);
}

const rules = JSON.parse(
  fs.readFileSync("scripts/systematic/label-overrides.json", "utf8"),
).renames.filter((r) => r.law === lawCode);

const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, case_display_label, parent_id, path")
  .eq("law_code", lawCode)
  .limit(3000);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));

// 부모 이름은 원본과 같은 기준으로 본다 — 앞의 `05 ` 번호는 뺀다.
const bare = (s) => s.replace(/^\s*\d{2}\s+/, "").trim();

const plan = [];
const already = [];
for (const r of rules) {
  const hits = nodes.filter((n) => {
    if (bare(n.display_label) !== r.from) return false;
    const p = n.parent_id ? byId.get(n.parent_id) : null;
    return bare(p?.display_label ?? "") === r.parent;
  });
  if (!hits.length) {
    // 이미 바뀐 상태인지 확인 — 그러면 할 일이 없다.
    const done = nodes.some((n) => {
      if (bare(n.display_label) !== r.to) return false;
      const p = n.parent_id ? byId.get(n.parent_id) : null;
      return bare(p?.display_label ?? "") === r.parent;
    });
    if (done) already.push(`${r.parent} > ${r.from} → ${r.to}`);
    else console.log(`★대상 없음 — ${r.parent} > ${r.from}`);
    continue;
  }
  if (hits.length > 1) {
    console.log(`★여러 개가 걸림(중단) — ${r.parent} > ${r.from}`);
    hits.forEach((h) => console.log(`     ${h.path}`));
    process.exit(1);
  }
  plan.push({ node: hits[0], to: r.to, from: r.from, parent: r.parent });
}

console.log(`\n=== ${lawCode} — 규칙 ${rules.length} · 바꿀 것 ${plan.length} · 이미 반영 ${already.length}`);
plan.forEach((p) => console.log(`   ${p.parent} > ${p.from}  →  ${p.to}   (${p.node.path})`));

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

for (const p of plan) {
  const patch = { display_label: p.to };
  // 판례용 이름이 같은 값이면 함께 맞춘다. 다르면 손대지 않는다.
  if (p.node.case_display_label && bare(p.node.case_display_label) === p.from)
    patch.case_display_label = p.to;
  const { error: e } = await sb
    .from("systematic_nodes")
    .update(patch)
    .eq("node_id", p.node.node_id);
  if (e) throw new Error(`${p.from} 실패: ${e.message}`);
}
console.log(`\n적용 완료 — ${plan.length}건`);
