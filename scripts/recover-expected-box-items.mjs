// 박스형(mc_box) 예상문제 보기 항목 mis-split 복구.
//
// 결함: extractBoxItems(parse-problems) 에 단조성 가드가 없어, 보기 본문 안에 다른
// 보기 마커가 인용되면(예: ㈑ 본문의 "㈐에 의한 …") 그 지점에서 잘라 ㈑ 가 truncate
// 되고 뒷부분이 잘못된 마커의 가짜 항목이 된다. (라)(마) 짤림 = 이 패턴.
//
// 복구: 문제편 원본 box row 를 단조성 가드로 재추출(내부 인용 마커는 본문으로 유지)한
// 뒤 DB 와 reconcile —
//   - correct item ↔ DB row: 같은 marker + DB body 가 correct 의 prefix/equal 인 첫 행.
//     body 가 잘렸으면 full 로 UPDATE. (curated exp/art/ox 보존)
//   - 어느 correct 에도 안 붙는 DB row = 가짜 → DELETE.
// 안전: DB body 가 correct 의 prefix/equal 일 때만 매칭(운영자 편집 보존). 가짜 행은
// curated 데이터 없는 것만 삭제(있으면 리포트만).
//
//   node scripts/recover-expected-box-items.mjs            # dry-run
//   node scripts/recover-expected-box-items.mjs --apply

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import "dotenv/config";

const APPLY = process.argv.includes("--apply");
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
console.log(`proj: ${process.env.SUPABASE_URL}`);

const FAMILIES = [
  "㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗",
  "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉪㉫㉬㉭",
  "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹",
  "㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉",
];
const normBody = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const flat = (s) => (s ?? "").replace(/\s+/g, "");

// 단조성 가드 박스 추출 — 원본 row → [{marker, body}].
function extractGuarded(rawText) {
  let text = rawText.replace(/^\|\s*/, "").replace(/\s*\|\s*$/, "");
  text = text.split(/\n/)[0];
  let best = null;
  for (const fam of FAMILIES) {
    const re = new RegExp(`[${fam}]`, "g");
    const occ = [];
    let m;
    while ((m = re.exec(text)) !== null)
      occ.push({ marker: m[0], idx: m.index, fi: fam.indexOf(m[0]) });
    if (occ.length < 2) continue;
    // 단조 증가 family-index 만 split point.
    const splits = [occ[0]];
    let prev = occ[0].fi;
    for (let k = 1; k < occ.length; k++) {
      if (occ[k].fi > prev) {
        splits.push(occ[k]);
        prev = occ[k].fi;
      }
    }
    if (!best || splits.length > best.splits.length)
      best = { fam, splits, text };
  }
  if (!best) return [];
  const items = [];
  for (let k = 0; k < best.splits.length; k++) {
    const cur = best.splits[k];
    const next = best.splits[k + 1];
    const body = best.text
      .slice(cur.idx + cur.marker.length, next ? next.idx : best.text.length)
      .replace(/\|/g, " ")
      .trim();
    if (body) items.push({ marker: cur.marker, body });
  }
  return items;
}

const paras = JSON.parse(
  readFileSync("source/_converted/expected-problems.json", "utf8"),
).paragraphs;
// 원본 box row 찾기 — 첫 DB 보기 본문의 distinctive 조각이 들어있는 "|" 시작 paragraph.
function findSourceRow(dbItems) {
  const probe = [...dbItems].sort((a, b) => b.body_md.length - a.body_md.length)[0];
  const needle = flat(probe.body_md).slice(0, 22);
  if (needle.length < 10) return null;
  const hits = paras.filter(
    (p) => /^\s*\|/.test(p.text ?? "") && flat(p.text).includes(needle),
  );
  return hits.length === 1 ? hits[0].text : null;
}

const FAM_INDEX = (m) => {
  for (const f of FAMILIES) {
    const i = f.indexOf(m);
    if (i >= 0) return i;
  }
  return -1;
};

const { data: law } = await supa.from("laws").select("law_id").eq("law_code", "patent").single();
const { data: probs } = await supa
  .from("problems")
  .select("problem_id, body_md")
  .eq("law_id", law.law_id).eq("origin", "expected").eq("format", "mc_box").is("deleted_at", null);
const ids = probs.map((p) => p.problem_id);
const stemById = new Map(probs.map((p) => [p.problem_id, p.body_md]));

const byProb = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const { data } = await supa
    .from("problem_box_items")
    .select("box_item_id, problem_id, marker, position_index, body_md, explanation_md, related_article_id, related_case_id, ox_truth, ox_ineligible")
    .in("problem_id", ids.slice(i, i + 100));
  for (const b of data ?? []) {
    if (!byProb.has(b.problem_id)) byProb.set(b.problem_id, []);
    byProb.get(b.problem_id).push(b);
  }
}

const updates = []; // {box_item_id, problem_id, marker, old, new}
const deletes = []; // {box_item_id, problem_id, marker, body, curated}
const skipped = []; // {problem_id, reason}

for (const [pid, itemsRaw] of byProb) {
  const items = [...itemsRaw].sort((a, b) => a.position_index - b.position_index);
  // 비단조(mis-split) 만 대상 — 정상 문제는 건드리지 않음.
  let monotonic = true, prev = -1;
  for (const it of items) {
    const fi = FAM_INDEX(it.marker);
    if (fi <= prev) { monotonic = false; break; }
    prev = fi;
  }
  if (monotonic) continue;

  const row = findSourceRow(items);
  if (!row) { skipped.push({ pid, reason: "원본 box row 못 찾음" }); continue; }
  const correct = extractGuarded(row);
  if (correct.length === 0) { skipped.push({ pid, reason: "원본 추출 실패" }); continue; }

  // reconcile
  const claimed = new Set();
  const probUpdates = []; // {box_item_id, problem_id, oldMarker, newMarker, old, new}
  const matchedCorrect = new Set();
  const bidi = (a, b) => a === b || a.startsWith(b) || b.startsWith(a); // trailing "|" 등 허용
  // pass1 — 같은 marker + 양방향 prefix.
  for (let ci = 0; ci < correct.length; ci++) {
    const c = correct[ci];
    const match = items.find(
      (it) => !claimed.has(it.box_item_id) && it.marker === c.marker && bidi(normBody(it.body_md), normBody(c.body)),
    );
    if (!match) continue;
    claimed.add(match.box_item_id);
    matchedCorrect.add(ci);
    if (normBody(match.body_md) !== normBody(c.body))
      probUpdates.push({ box_item_id: match.box_item_id, problem_id: pid, oldMarker: match.marker, newMarker: c.marker, old: match.body_md, new: c.body });
  }
  // pass2 — 남은 correct ↔ 남은 DB row 를 "수가 같을 때만" 순서로 1:1 (마커 밀림 교정).
  const remCorrect = correct.map((c, i) => ({ c, i })).filter((x) => !matchedCorrect.has(x.i));
  const remDb = items.filter((it) => !claimed.has(it.box_item_id)).sort((a, b) => a.position_index - b.position_index);
  if (remCorrect.length > 0 && remCorrect.length === remDb.length) {
    for (let k = 0; k < remCorrect.length; k++) {
      const it = remDb[k], c = remCorrect[k].c;
      claimed.add(it.box_item_id);
      matchedCorrect.add(remCorrect[k].i);
      probUpdates.push({ box_item_id: it.box_item_id, problem_id: pid, oldMarker: it.marker, newMarker: c.marker, old: it.body_md, new: c.body });
    }
  }
  if (matchedCorrect.size !== correct.length) {
    skipped.push({ pid, reason: `correct ${correct.length}개 중 ${matchedCorrect.size}개만 매칭 — 수동 검토` });
    continue;
  }
  const spurious = items.filter((it) => !claimed.has(it.box_item_id));
  // 가짜 행에 사람이 단 데이터(해설/OX)가 있으면 삭제 보류. related_article_id 는 auto-backfill 이라 무시.
  const curatedSpurious = spurious.filter((it) => it.explanation_md || it.ox_truth);
  if (curatedSpurious.length > 0) {
    skipped.push({ pid, reason: `가짜 행에 해설/OX 있음(${curatedSpurious.length}) — 수동 검토` });
    continue;
  }
  updates.push(...probUpdates);
  for (const it of spurious)
    deletes.push({ box_item_id: it.box_item_id, problem_id: pid, marker: it.marker, body: it.body_md });
}

console.log(`\n=== 복구 대상 문제별 ===`);
const pids = new Set([...updates.map((u) => u.problem_id), ...deletes.map((d) => d.problem_id)]);
for (const pid of pids) {
  console.log(`\n[${pid}] ${JSON.stringify((stemById.get(pid) ?? "").slice(0, 36))}`);
  for (const u of updates.filter((x) => x.problem_id === pid)) {
    const mk = u.oldMarker === u.newMarker ? u.newMarker : `${u.oldMarker}→${u.newMarker}`;
    console.log(`  UPDATE ${mk}  ${normBody(u.old).length}→${normBody(u.new).length}자\n     old: ${JSON.stringify(u.old.slice(0, 50))}\n     new: ${JSON.stringify(u.new.slice(0, 80))}`);
  }
  for (const d of deletes.filter((x) => x.problem_id === pid))
    console.log(`  DELETE ${d.marker} (가짜)  ${JSON.stringify(d.body.slice(0, 60))}`);
}
console.log(`\n합계: UPDATE ${updates.length}, DELETE ${deletes.length}`);
if (skipped.length) {
  console.log(`\n=== 건너뜀(수동 검토) ${skipped.length} ===`);
  for (const s of skipped) console.log(`  ${s.pid} — ${s.reason}`);
}

if (!APPLY) { console.log(`\n(dry-run — --apply 로 실행)`); process.exit(0); }

console.log(`\n=== APPLY ===`);
let u = 0, d = 0;
for (const up of updates) {
  const { error } = await supa.from("problem_box_items").update({ body_md: up.new, marker: up.newMarker }).eq("box_item_id", up.box_item_id);
  if (error) console.error(`  UPDATE 실패 ${up.box_item_id}: ${error.message}`); else u++;
}
for (const del of deletes) {
  const { error } = await supa.from("problem_box_items").delete().eq("box_item_id", del.box_item_id);
  if (error) console.error(`  DELETE 실패 ${del.box_item_id}: ${error.message}`); else d++;
}
console.log(`완료 — UPDATE ${u}, DELETE ${d}`);
