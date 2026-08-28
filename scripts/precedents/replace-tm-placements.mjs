// 상표 판례 배치 재동기화 — 개정판에서 주제가 재편됐을 때 판례를 새 주제 노드로 옮긴다.
//
// ★왜 별도 스크립트인가: seed 는 이미 있는 판례를 case_number 로 skip 하고(손보정 보존),
//   resync-tm-mirrors 는 "배치(primary_node_id)는 건드리지 않는다"고 못박혀 있다.
//   판본이 바뀌어 주제 번호가 밀리면(구 주제40 권리범위확인심판 → 신 주제39) 아무도
//   판례를 옮기지 않아, 화면에는 옛 주제 아래 그대로 남는다.
//
//   node scripts/precedents/replace-tm-placements.mjs            # dry-run
//   node scripts/precedents/replace-tm-placements.mjs --apply
//   node scripts/precedents/replace-tm-placements.mjs --apply --prune   # 빈 주제 노드까지 정리
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune");
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const data = JSON.parse(readFileSync(argOf("--json", "source/_converted/tm-precedents.json"), "utf8"));

const { data: nodes, error: nErr } = await sb
  .from("systematic_nodes")
  .select("node_id, path, display_label, case_only")
  .eq("law_code", "trademark");
if (nErr) throw nErr;
const titleKey = (s) => String(s ?? "").replace(/^주제\s*\d+\s*/, "").replace(/\s+/g, "");
const nodeByTitle = new Map();
for (const n of nodes) {
  if (!n.case_only || !/^주제\s*\d+\s/.test(n.display_label)) continue;
  if (!nodeByTitle.has(titleKey(n.display_label))) nodeByTitle.set(titleKey(n.display_label), n);
}

// 교재 순서 = 주제 순 → 주제 내 순. 중복 수록은 최초 1회만(시드와 같은 정책).
const want = new Map(); // case_number → { node, seq, topicNo }
let seq = 0;
const missingNode = [];
for (const t of data.topics) {
  const node = nodeByTitle.get(titleKey(t.title));
  if (!node) missingNode.push(`주제${t.no} ${t.title}`);
  for (const c of t.cases) {
    seq++;
    if (want.has(c.caseNumber)) continue;
    if (node) want.set(c.caseNumber, { node, seq, topicNo: t.no, topicTitle: t.title });
  }
}
if (missingNode.length) {
  console.log(`✗ 주제 노드 미확보 ${missingNode.length}건 — seed 를 먼저 돌리세요:`);
  for (const m of missingNode) console.log("   ", m);
  process.exit(1);
}

const { data: rows, error } = await sb
  .from("cases")
  .select("case_id, case_number, primary_node_id, pending_primary_node_id, source_seq")
  .contains("subject_laws", ["trademark"])
  .is("deleted_at", null);
if (error) throw error;
const nodeById = new Map(nodes.map((n) => [n.node_id, n]));

// ★'최신판례' 노드에 있는 판례는 건드리지 않는다 — 2026년 이후 선고분을 원장 승인 전까지
//   한곳에 모아 두는 큐레이션 플로우다(트리거 force_latest_case_placement). 대신 교재가
//   말하는 자리를 pending_primary_node_id 에 넣어, 승인 버튼 한 번으로 제자리에 가게 한다.
const latestNode = nodes.find((n) => /최신판례/.test(n.display_label)) ?? null;

let moved = 0, reseq = 0, same = 0, notInBook = 0, failed = 0, queued = 0;
for (const r of rows) {
  const w = want.get(r.case_number);
  if (!w) {
    notInBook++;
    console.log(`  ? 교재 미수록(배치 유지): ${r.case_number}`);
    continue;
  }
  const inLatestQueue = latestNode && r.primary_node_id === latestNode.node_id;
  const seqChanged = r.source_seq !== w.seq;
  if (inLatestQueue) {
    const pendChanged = r.pending_primary_node_id !== w.node.node_id;
    if (!pendChanged && !seqChanged) {
      same++;
      continue;
    }
    if (pendChanged) {
      queued++;
      console.log(`  ⏸ ${r.case_number}: 최신판례 대기 유지 · 승인 시 → "${w.node.display_label}"`);
    }
    if (!APPLY) continue;
    const { error: qErr } = await sb
      .from("cases")
      .update({ pending_primary_node_id: w.node.node_id, source_seq: w.seq })
      .eq("case_id", r.case_id);
    if (qErr) {
      failed++;
      console.log(`  ! ${r.case_number}: ${qErr.message}`);
    }
    continue;
  }
  const nodeChanged = r.primary_node_id !== w.node.node_id;
  if (!nodeChanged && !seqChanged) {
    same++;
    continue;
  }
  if (nodeChanged) {
    moved++;
    const from = nodeById.get(r.primary_node_id)?.display_label ?? "(없음)";
    console.log(`  → ${r.case_number}: "${from}" → "${w.node.display_label}"`);
  } else reseq++;
  if (!APPLY) continue;
  const { error: uErr } = await sb
    .from("cases")
    .update({ primary_node_id: w.node.node_id, source_seq: w.seq })
    .eq("case_id", r.case_id);
  if (uErr) {
    failed++;
    console.log(`  ! ${r.case_number}: ${uErr.message}`);
  }
}
console.log(
  `${APPLY ? "적용" : "dry-run"}: 대상 ${rows.length} / 주제 이동 ${moved} / 최신판례 대기(예약만) ${queued} / 순번만 변경 ${reseq} / 그대로 ${same} / 교재 미수록 ${notInBook} / 실패 ${failed}`,
);

// 빈 주제 노드 — 교재에서 사라진 주제(예: 구 주제39 지리적표시단체표장의 취소심판).
const wantedIds = new Set([...want.values()].map((w) => w.node.node_id));
const empties = [];
for (const n of nodes) {
  if (!n.case_only || !/^주제\s*\d+\s/.test(n.display_label)) continue;
  if (wantedIds.has(n.node_id)) continue;
  const { count } = await sb
    .from("cases")
    .select("case_id", { count: "exact", head: true })
    .eq("primary_node_id", n.node_id)
    .is("deleted_at", null);
  empties.push({ n, count: count ?? 0 });
}
for (const e of empties)
  console.log(`  ▫ 교재에서 사라진 주제 노드: "${e.n.display_label}" (${e.n.path}) 남은 판례 ${e.count}`);
if (PRUNE && APPLY) {
  for (const e of empties) {
    if (e.count > 0) continue;
    const { error: dErr } = await sb.from("systematic_nodes").delete().eq("node_id", e.n.node_id);
    console.log(dErr ? `  ! 삭제 실패 ${e.n.display_label}: ${dErr.message}` : `  ✂ 삭제: ${e.n.display_label}`);
  }
}
