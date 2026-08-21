// "각론 > 정정심판/특허의 정정" 노드의 수록 번호 재부여 (원장 지시 2026-08-21).
//
// 워크북에는 **정정심판(136)** 과 **정정청구(132의3, 133의2, 137)** 가 별개 단원이라
// 각각 01번부터 번호가 붙는다. 체계도는 둘을 한 노드로 합쳐 놓아서 같은 목록 안에
// 1~4번이 두 번씩 나왔다. 정정심판 번호는 그대로 두고, 정정청구 쪽을 정정심판의
// 마지막 번호 다음부터 이어 붙인다.
//
//   기출(기출+변형): 정정심판 1~11 유지 · 정정청구 1~4 → 12~15
//   예상:            정정심판 1~9  유지 · 정정청구 1~10 → 10~19
//
// ★수록 번호만 바꾼다. 배치(primary_node_id)·문제 고유번호(display_no)·실제 시험번호
//   (exam_number)는 건드리지 않는다. 교재 문구 변경이 아니므로 개정 원장은 억제한다.
//
//   node scripts/workbook/renumber-jeongjeong-node.mjs
//   node scripts/workbook/renumber-jeongjeong-node.mjs --apply
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PROD_REF = "mcgdoplovrjgklbxmozi";
if (!process.env.SUPABASE_URL?.includes(PROD_REF)) throw new Error("운영 DB 가 아니다 — 중단");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const NODE_PATH = "patent.b6.b6.b5";
/** 이어 붙일 대상 = 정정청구 단원 문항(display_no). 앞 단원(정정심판)은 손대지 않는다. */
const GROUPS = [
  { label: "기출", keep: [6137, 6138, 6139, 6140, 6141, 6142, 6143, 6144, 6145, 6146, 6147],
    shift: [6156, 6157, 6158, 6159] },
  { label: "예상", keep: [7983, 7984, 7985, 7986, 7987, 7988, 7989, 7990, 7991],
    shift: [8005, 8006, 8007, 8008, 8009, 8010, 8011, 8012, 8013, 8014] },
];

const { data: nodes, error: nErr } = await sb
  .from("systematic_nodes")
  .select("node_id, display_label, path")
  .eq("law_code", "patent");
if (nErr) throw nErr;
const nodeIds = nodes
  .filter((n) => String(n.path) === NODE_PATH || String(n.path).startsWith(`${NODE_PATH}.`))
  .map((n) => n.node_id);

const { data: rows, error } = await sb
  .from("problems")
  .select("problem_id, display_no, problem_number, year, origin, primary_node_id, body_md")
  .in("primary_node_id", nodeIds)
  .is("deleted_at", null);
if (error) throw error;
const byDisplayNo = new Map(rows.map((r) => [r.display_no, r]));

const plan = [];
for (const g of GROUPS) {
  // 앞 단원이 1..N 으로 온전한지 먼저 확인한다 — 어긋나면 전제가 깨진 것이라 중단.
  const keep = g.keep.map((d) => byDisplayNo.get(d));
  if (keep.some((r) => !r)) throw new Error(`${g.label}: 앞 단원 문항이 이 노드에 없다`);
  const keepNos = keep.map((r) => r.problem_number).sort((a, b) => a - b);
  const expected = keep.map((_, i) => i + 1);
  if (JSON.stringify(keepNos) !== JSON.stringify(expected)) {
    throw new Error(`${g.label}: 앞 단원 번호가 1~${keep.length} 이 아니다 — ${keepNos.join(",")}`);
  }
  const base = keep.length;

  const shift = g.shift.map((d) => byDisplayNo.get(d));
  if (shift.some((r) => !r)) throw new Error(`${g.label}: 뒷 단원 문항이 이 노드에 없다`);
  // 뒷 단원도 1..M 이어야 한다(워크북에서 새로 번호가 시작된 증거).
  const shiftNos = shift.map((r) => r.problem_number);
  if (JSON.stringify([...shiftNos].sort((a, b) => a - b)) !== JSON.stringify(shift.map((_, i) => i + 1))) {
    throw new Error(`${g.label}: 뒷 단원 번호가 1~${shift.length} 이 아니다 — ${shiftNos.join(",")}`);
  }

  console.log(`\n■ ${g.label} — 정정심판 1~${base} 유지 · 정정청구 ${shift.length}건 이어 붙임`);
  for (const r of shift.slice().sort((a, b) => a.problem_number - b.problem_number)) {
    const next = base + r.problem_number;
    console.log(
      `   P-${r.display_no}  ${String(r.problem_number).padStart(2)}번 → ${String(next).padStart(2)}번` +
        `  ${String(r.body_md).replace(/\s+/g, " ").slice(0, 54)}`,
    );
    plan.push({ problemId: r.problem_id, displayNo: r.display_no, from: r.problem_number, to: next });
  }
}

// 바뀐 뒤 같은 origin 계열 안에서 번호가 겹치지 않는지 확인.
for (const g of GROUPS) {
  const all = [...g.keep, ...g.shift].map((d) => {
    const r = byDisplayNo.get(d);
    const p = plan.find((x) => x.displayNo === d);
    return p ? p.to : r.problem_number;
  });
  const dup = all.filter((v, i) => all.indexOf(v) !== i);
  if (dup.length) throw new Error(`${g.label}: 재부여 후에도 번호 중복 ${dup.join(",")}`);
  console.log(`\n${g.label} 결과 번호: ${all.slice().sort((a, b) => a - b).join(", ")} (중복 없음)`);
}

if (!APPLY) {
  console.log("\n--apply 를 붙이면 반영합니다.");
  process.exit(0);
}

const backup = path.resolve(process.cwd(), "tmp/renumber-jeongjeong-backup.json");
fs.writeFileSync(backup, JSON.stringify(plan, null, 1), "utf8");
console.log(`\n백업 ${backup}`);

// 수록 번호 재부여는 추록 발행 대상이 아니다 — 개정 원장 억제.
const { data: win, error: wErr } = await sb.rpc("fn_open_suppress_window", {
  p_minutes: 15,
  p_reason: "정정심판/정정청구 병합 노드 수록 번호 재부여",
  p_scope: ["mcq"],
});
if (wErr) throw new Error(wErr.message);
try {
  // 큰 번호부터 — 중간 상태에서도 같은 노드 안 번호가 겹치지 않게.
  for (const p of [...plan].sort((a, b) => b.to - a.to)) {
    const { error: uErr } = await sb
      .from("problems")
      .update({ problem_number: p.to })
      .eq("problem_id", p.problemId);
    if (uErr) throw new Error(`P-${p.displayNo}: ${uErr.message}`);
  }
} finally {
  await sb.rpc("fn_close_suppress_window", { p_window_id: win });
}
console.log(`${plan.length}건 반영 완료.`);
