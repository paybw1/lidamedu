// 체계도 원본(조문용 + 판례/객관식용) → 운영 DB 반영.
//
// ★삭제를 최소화한다. systematic_nodes 를 참조하는 테이블이 14개라(문제·판례·조문·도해·
//   학습계획·Q&A…) 노드를 지우면 그 연결이 끊긴다. 그래서 **노드 id 를 유지한 채**
//   이름과 부모만 바꾸는 것이 기본이고, 지우는 것은 "자식도 없고 붙은 콘텐츠도 없는
//   빈 묶음"뿐이다.
// ★원본에 없는 `주제N …`(case_only) 층은 판례 배치 레이어다. 원본 체계도에 아예 없는
//   별도 층이므로 **건드리지 않고 부모를 따라 옮긴다.**
// ★path 는 트리거가 아니라 애플리케이션이 관리한다(`design.b1.b2.t3`). 이동 뒤에는
//   법 전체의 path 를 다시 계산한다 — 하나만 고치면 자손이 어긋난다.
//
//   node scripts/systematic/apply-tree.mjs trademark          # dry-run
//   node scripts/systematic/apply-tree.mjs trademark --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ★파서는 apply-article-refs 와 **같은 모듈**을 쓴다. 두 벌로 두면 트리와 조문 배치가
//   서로 다른 원본 해석 위에 놓인다.
import {
  SOURCES,
  dbPathOf as dbPathOfNode,
  keyPath,
  matchKey,
  norm,
  parseTree,
} from "./lib/source-tree.mjs";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});


const lawCode = process.argv[2];
const APPLY = process.argv.includes("--apply");
const src = SOURCES[lawCode];
if (!src) {
  console.error(`사용: node scripts/systematic/apply-tree.mjs <${Object.keys(SOURCES).join("|")}> [--apply]`);
  process.exit(1);
}


const articleNodes = parseTree(src.article, lawCode);
const caseNodes = parseTree(src.caseView, lawCode);

// ── 목표 트리 ──────────────────────────────────────────────────────────────
// 조문용이 뼈대. 판례용에만 있으면 case_only, 같은 자리인데 이름이 다르면 case_display_label.
const target = new Map(); // keyPath → {displayLabel, caseDisplayLabel, caseOnly, parentKey, ord}
let ord = 0;
for (const n of articleNodes) {
  const k = keyPath(n.path);
  if (target.has(k)) continue;
  target.set(k, {
    key: k,
    displayLabel: n.displayLabel,
    caseDisplayLabel: null,
    caseOnly: false,
    parentKey: n.parentPath ? keyPath(n.parentPath) : null,
    ord: ord++,
  });
}
for (const n of caseNodes) {
  const k = keyPath(n.path);
  const hit = target.get(k);
  if (hit) {
    if (n.displayLabel !== hit.displayLabel) hit.caseDisplayLabel = n.displayLabel;
    continue;
  }
  target.set(k, {
    key: k,
    displayLabel: n.displayLabel,
    caseDisplayLabel: null,
    caseOnly: true,
    parentKey: n.parentPath ? keyPath(n.parentPath) : null,
    ord: ord++,
  });
}
// 판례용에만 있는 노드의 부모가 조문용에 없을 수 있다 — 그 부모도 case_only 로 만든다.
for (const t of [...target.values()]) {
  let pk = t.parentKey;
  while (pk && !target.has(pk)) {
    const seg = pk.split(" / ");
    target.set(pk, {
      key: pk,
      displayLabel: seg[seg.length - 1],
      caseDisplayLabel: null,
      caseOnly: true,
      parentKey: seg.slice(0, -1).join(" / ") || null,
      ord: ord++,
    });
    pk = seg.slice(0, -1).join(" / ") || null;
  }
}

// ── 현재 DB ────────────────────────────────────────────────────────────────
const { data: nodes, error } = await sb
  .from("systematic_nodes")
  .select("node_id, parent_id, path, display_label, case_display_label, case_only, ord")
  .eq("law_code", lawCode);
if (error) throw new Error(error.message);
const byId = new Map(nodes.map((n) => [n.node_id, n]));
const childrenOf = new Map();
for (const n of nodes) {
  const arr = childrenOf.get(n.parent_id) ?? [];
  arr.push(n);
  childrenOf.set(n.parent_id, arr);
}
const dbPathOf = (n) => dbPathOfNode(n, byId);

// ── 매칭: 경로 우선, 없으면 잎 라벨(이동) ──────────────────────────────────
const usedNode = new Set();
const nodeForKey = new Map();
for (const n of nodes) {
  const k = keyPath(dbPathOf(n));
  if (target.has(k) && !nodeForKey.has(k)) {
    nodeForKey.set(k, n);
    usedNode.add(n.node_id);
  }
}
const leafIndex = new Map();
for (const n of nodes) {
  if (usedNode.has(n.node_id) || n.case_only) continue;
  const lk = matchKey(norm(n.display_label));
  const arr = leafIndex.get(lk) ?? [];
  arr.push(n);
  leafIndex.set(lk, arr);
}
for (const [k, t] of target) {
  if (nodeForKey.has(k)) continue;
  const lk = matchKey(t.displayLabel);
  const cands = leafIndex.get(lk);
  if (cands && cands.length) {
    const n = cands.shift();
    nodeForKey.set(k, n);
    usedNode.add(n.node_id);
  }
}

const leftovers = nodes.filter((n) => !usedNode.has(n.node_id));
const topicLeftovers = leftovers.filter((n) => n.case_only);
const plainLeftovers = leftovers.filter((n) => !n.case_only);

// ── 붙은 콘텐츠 ────────────────────────────────────────────────────────────
const REFS = [
  ["problem_systematic_links", "node_id"],
  ["case_systematic_links", "node_id"],
  ["article_systematic_links", "node_id"],
  ["problems", "primary_node_id"],
  ["cases", "primary_node_id"],
  ["cases", "pending_primary_node_id"],
  ["dohae_unit_nodes", "node_id"],
  ["lesson_node_links", "node_id"],
  ["problem_box_items", "related_node_id"],
  ["problem_choices", "related_node_id"],
  ["qna_threads", "node_id"],
  ["study_logs", "node_id"],
  ["study_plan_items", "node_id"],
  ["study_timer_sessions", "node_id"],
];
async function contentCount(ids) {
  const out = new Map(ids.map((i) => [i, 0]));
  for (const [table, col] of REFS) {
    for (let i = 0; i < ids.length; i += 150) {
      const { data } = await sb.from(table).select(col).in(col, ids.slice(i, i + 150));
      for (const r of data ?? []) out.set(r[col], (out.get(r[col]) ?? 0) + 1);
    }
  }
  return out;
}
const leftoverContent = leftovers.length
  ? await contentCount(leftovers.map((n) => n.node_id))
  : new Map();

console.log(`\n═══ ${src.label} 체계도 반영 ${APPLY ? "(적용)" : "(dry-run)"} ═══`);
console.log(`목표 ${target.size}노드 · 현재 ${nodes.length}노드`);
const willRename = [...target.values()].filter((t) => {
  const n = nodeForKey.get(t.key);
  return n && (n.display_label !== t.displayLabel || (n.case_display_label ?? null) !== t.caseDisplayLabel);
}).length;
const willInsert = [...target.values()].filter((t) => !nodeForKey.get(t.key)).length;
console.log(`  이름·표기 갱신 ${willRename}`);
console.log(`  신규 추가     ${willInsert}`);
console.log(`  유지(주제 층) ${topicLeftovers.length}`);
console.log(`  원본에 없는 일반 노드 ${plainLeftovers.length}`);

// ★"자식이 남는가"는 **이동한 뒤** 기준으로 봐야 한다. 목표 트리에 자리를 찾은 자식은
//   다른 부모로 옮겨 가므로, 지금 붙어 있다고 세면 지울 수 있는 빈 묶음도 못 지운다.
const movingAway = new Set(
  [...target.values()].map((t) => nodeForKey.get(t.key)?.node_id).filter(Boolean),
);
const remainingChildren = (n) =>
  (childrenOf.get(n.node_id) ?? []).filter((c) => !movingAway.has(c.node_id));

const deletable = plainLeftovers.filter(
  (n) => (leftoverContent.get(n.node_id) ?? 0) === 0 && remainingChildren(n).length === 0,
);
const keepAnyway = plainLeftovers.filter((n) => !deletable.includes(n));
console.log(`     └ 비어 있어 삭제 가능 ${deletable.length} / 콘텐츠·자식이 있어 유지 ${keepAnyway.length}`);
for (const n of keepAnyway) {
  console.log(
    `        · ${dbPathOf(n)}  (콘텐츠 ${leftoverContent.get(n.node_id) ?? 0} · 남는 자식 ${remainingChildren(n).length})`,
  );
}

if (!APPLY) {
  console.log(`\ndry-run — 적용하려면 --apply`);
  process.exit(0);
}

// ── 적용 ───────────────────────────────────────────────────────────────────
const backupDir = path.resolve(process.cwd(), "tmp", "systematic");
fs.mkdirSync(backupDir, { recursive: true });
const backup = path.join(backupDir, `backup-${lawCode}-${new Date().toISOString().slice(0, 10)}.json`);
fs.writeFileSync(backup, JSON.stringify(nodes, null, 2), "utf8");
console.log(`\n백업: ${backup}`);

// 1) 신규 노드 먼저 만든다(부모부터 순서대로 — parentKey 가 이미 존재해야 한다).
const ordered = [...target.values()].sort(
  (a, b) => a.key.split(" / ").length - b.key.split(" / ").length || a.ord - b.ord,
);
let inserted = 0;
for (const t of ordered) {
  if (nodeForKey.get(t.key)) continue;
  const parent = t.parentKey ? nodeForKey.get(t.parentKey) : null;
  if (t.parentKey && !parent) {
    console.log(`  ★부모를 못 찾아 건너뜀: ${t.key}`);
    continue;
  }
  const { data: row, error: e } = await sb
    .from("systematic_nodes")
    .insert({
      law_code: lawCode,
      parent_id: parent?.node_id ?? null,
      path: `${lawCode}.tmp${inserted}`, // 아래에서 전체 재계산
      display_label: t.displayLabel,
      case_display_label: t.caseDisplayLabel,
      case_only: t.caseOnly,
      ord: t.ord,
    })
    .select("node_id, parent_id, path, display_label, case_display_label, case_only, ord")
    .single();
  if (e) throw new Error(`insert 실패 ${t.key}: ${e.message}`);
  nodeForKey.set(t.key, row);
  byId.set(row.node_id, row);
  inserted += 1;
}

// 2) 이름·부모·순서 갱신
let updated = 0;
for (const t of ordered) {
  const n = nodeForKey.get(t.key);
  if (!n) continue;
  const parent = t.parentKey ? nodeForKey.get(t.parentKey) : null;
  const patch = {};
  if (n.display_label !== t.displayLabel) patch.display_label = t.displayLabel;
  if ((n.case_display_label ?? null) !== t.caseDisplayLabel)
    patch.case_display_label = t.caseDisplayLabel;
  if (n.case_only !== t.caseOnly) patch.case_only = t.caseOnly;
  if ((n.parent_id ?? null) !== (parent?.node_id ?? null)) patch.parent_id = parent?.node_id ?? null;
  if (n.ord !== t.ord) patch.ord = t.ord;
  if (!Object.keys(patch).length) continue;
  const { error: e } = await sb.from("systematic_nodes").update(patch).eq("node_id", n.node_id);
  if (e) throw new Error(`update 실패 ${t.key}: ${e.message}`);
  Object.assign(n, patch);
  updated += 1;
}

// 2-b) 원본에 없는 노드는 순서를 맨 뒤로 민다.
// ★옛 ord 가 새로 매긴 ord(0..N) 사이에 끼면 「최신판례」 같은 노드가 목록 두 번째로
//   올라온다(2026-09-03 실제로 그랬다).
{
  let tail = ordered.length + 10;
  for (const n of leftovers) {
    await sb.from("systematic_nodes").update({ ord: tail }).eq("node_id", n.node_id);
    tail += 1;
  }
}

// 3) 빈 묶음 삭제
let removed = 0;
for (const n of deletable) {
  const { error: e } = await sb.from("systematic_nodes").delete().eq("node_id", n.node_id);
  if (!e) removed += 1;
}

// 4) path 재계산은 repath.mjs 가 맡는다.
// ★여기서 DB 를 오가며 계산했더니 부모는 새 경로, 자식은 옛 경로가 되는 상태가
//   82건 생겼다(2026-09-03). 전체를 메모리에서 먼저 계산해 한 번에 써야 한다.
console.log(
  `\n적용 완료 — 신규 ${inserted} · 갱신 ${updated} · 빈 묶음 삭제 ${removed}`,
);
console.log(
  `★path 재계산이 남았습니다 — node scripts/systematic/repath.mjs ${lawCode} --apply`,
);
