// 선지 해설 안의 파이프 표를 **원본 HWPX 의 병합(colspan/rowspan) 표**로 교체한다.
//
//   배경: hwpx-to-text 가 hp:cellSpan 을 버리고 병합 셀을 빈 칸으로 눌러버려,
//   교재에서 여러 칸에 걸쳐 있던 내용이 화면에서 어긋나 보였다(2026-08-16 신고).
//
//   안전장치: 셀 텍스트를 이어 만든 '서명'이 **정확히 일치**할 때만 교체한다.
//   (병합 정보만 다르고 텍스트는 같으므로 서명은 보존된다.)
//
//   node scripts/mcq-audit/restore-merged-tables.mjs            # dry-run
//   node scripts/mcq-audit/restore-merged-tables.mjs --apply
//   node scripts/mcq-audit/restore-merged-tables.mjs --pid <problem_id>
import { writeFileSync } from "node:fs";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { extractTables, toHtml, signatureOf } from "./hwpx-tables.mjs";

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const PID = ARGS.includes("--pid") ? ARGS[ARGS.indexOf("--pid") + 1] : null;

const BOOKS = [
  "source/특허법/특허법객관식/기출/[완0305+내지+해설편] 객관식(Ⅰ) 기출문제 [제20판].hwpx",
  "source/특허법/특허법객관식/예상/[완0306+내지+해설편] 리담특허법 객관식(Ⅱ) 예상문제 [제20판].hwpx",
];

// 원본 표를 서명으로 색인. 서명이 겹치는 표(같은 표가 두 번 실림)는 병합 형태가
// 같으면 문제 없고, 다르면 모호하므로 제외한다.
// 셀 안 항목 번호("1." "2.")는 문단 구성에 따라 한쪽에만 남는 경우가 있어,
// 정확 일치가 안 되면 번호를 뗀 서명으로 한 번 더 맞춘다(유일할 때만 인정).
const loose = (s) => s.replace(/\d+\./g, "");

const bySig = new Map();
const byLoose = new Map();
let nTables = 0;
for (const f of BOOKS) {
  for (const t of extractTables(f)) {
    nTables++;
    if (!t.sig) continue;
    const prev = bySig.get(t.sig);
    if (prev === undefined) bySig.set(t.sig, t);
    else if (prev && toHtml(prev) !== toHtml(t)) bySig.set(t.sig, null); // 모호 → 제외
    const lk = loose(t.sig);
    const lprev = byLoose.get(lk);
    if (lprev === undefined) byLoose.set(lk, t);
    else if (lprev && toHtml(lprev) !== toHtml(t)) byLoose.set(lk, null);
  }
}
console.log(`원본 표 ${nTables}개 · 서명 색인 ${bySig.size}개 (모호 ${[...bySig.values()].filter((v) => v === null).length})`);

// 파이프 표 블록. 데이터 행이 **없는** 것(머리행 + 구분선만)도 잡는다 —
// 교재의 한 칸짜리 '예시 박스'가 그 형태라 종전 규칙에선 통째로 빠져 있었다.
const TABLE_BLOCK_RE =
  /(^|\n)((?:\|[^\n]*\|[ \t]*\n)(?:\|[ \-:|\t]+\|[ \t]*(?:\n|$))(?:\|[^\n]*\|[ \t]*(?:\n|$))*)/g;

function pipeSignature(block) {
  const cells = [];
  for (const line of block.trim().split("\n")) {
    if (/^\s*\|?[\s:|-]+\|?\s*$/.test(line)) continue; // 구분선
    cells.push(
      ...line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()),
    );
  }
  return signatureOf(cells);
}

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rows = [];
for (let from = 0; ; from += 500) {
  let q = supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, explanation_md")
    .like("explanation_md", "%|%---%|%")
    .order("choice_id")
    .range(from, from + 499);
  if (PID) q = q.eq("problem_id", PID);
  const { data, error } = await q;
  if (error) throw error;
  rows.push(...(data ?? []));
  if (!data || data.length < 500) break;
}
console.log(`파이프 표를 가진 선지 해설 ${rows.length}개`);

const plan = [];
const miss = [];
for (const r of rows) {
  const before = r.explanation_md ?? "";
  let replaced = 0;
  let unmatched = 0;
  const after = before.replace(TABLE_BLOCK_RE, (match, pre, block) => {
    const sig = pipeSignature(block);
    const t = bySig.get(sig) ?? byLoose.get(loose(sig));
    if (!t) {
      unmatched++;
      miss.push({ choiceId: r.choice_id, problemId: r.problem_id, idx: r.choice_index, sigHead: sig.slice(0, 50), ambiguous: t === null });
      return match;
    }
    replaced++;
    return `${pre}${toHtml(t)}\n`;
  });
  if (replaced > 0) plan.push({ ...r, before, after, replaced, unmatched });
}

console.log(`\n교체 대상 ${plan.length}개 선지 · 표 ${plan.reduce((a, x) => a + x.replaced, 0)}개`);
console.log(`원본에서 못 찾은 표 ${miss.length}개 (모호 ${miss.filter((m) => m.ambiguous).length}) — 그대로 둔다`);

if (plan.length > 0) {
  writeFileSync(
    "scripts/mcq-audit/backups/backup-merged-tables.json",
    JSON.stringify(plan.map((x) => ({ choiceId: x.choice_id, problemId: x.problem_id, choiceIndex: x.choice_index, before: x.before })), null, 1),
    "utf8",
  );
  console.log("백업: scripts/mcq-audit/backups/backup-merged-tables.json");
}
for (const m of miss.slice(0, 10)) console.log(`  미매칭 pid=${m.problemId} 선지${m.idx} — ${m.sigHead}…`);

if (!APPLY) {
  console.log("\ndry-run — 반영하려면 --apply");
  process.exit(0);
}
let n = 0;
for (const x of plan) {
  const { error } = await supa
    .from("problem_choices")
    .update({ explanation_md: x.after })
    .eq("choice_id", x.choice_id);
  if (error) throw error;
  n++;
}
console.log(`\n✓ ${n}개 선지의 표를 병합 형태로 교체 완료`);
