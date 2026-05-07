// 박스형(mc_box) 문제의 problems.explanation_md 를 box_item 마커 단위로 분할.
//
// - mc_box 문제만 대상.
// - 각 문제의 problem_box_items 에서 marker 목록 (예: ㈎㈏㈐㈑㈒) 가져옴.
// - explanation_md 라인을 walk:
//   * 라인이 표 행(`|`)으로 시작 → 현재 블록에 누적 (마커 detect 안함)
//   * 라인이 그 문제의 marker(들) 로 시작 → 새 블록 시작 (다중 마커 OK)
//   * 그 외 → 현재 블록에 누적 (preamble 또는 직전 블록 본문 — "따라서 ..." 같은 summary 포함)
// - 첫 마커 이전의 라인 = preamble → problems.explanation_md 보존
// - 각 블록의 본문 (마커 stripped) 을 box_items.explanation_md 로 저장
// - 이미 box_item.explanation_md 가 있는 항목과 겹치면 해당 problem 전체 스킵 (덮어쓰기 방지)

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const pidIdx = args.indexOf("--problem-id");
const PROBLEM_ID = pidIdx >= 0 ? args[pidIdx + 1] : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 마커가 자모(ㄱ-ㅎ) 인지 판정 — 이 경우 마커 뒤에 마침표가 붙는 경우 허용.
function isJamoMarker(m) {
  return /^[ㄱ-ㅎ]$/.test(m);
}

function buildLineMarkerRegex(markers) {
  // markers 는 boxItem.marker 들의 배열. 라인 시작에서 1개 이상의 연속 마커를 매치.
  // 자모 마커는 마침표 + 공백 (또는 아무것도 없을 수도) 허용.
  const escaped = markers.map(escapeRegex);
  // [marker]+ 구성 — 같은 패밀리에서 다중 (㈎㈏ 등) 매치를 위해 character class 로 합침.
  // 자모와 비자모가 섞이면 분리. 여기선 한 문제 내에서 같은 패밀리만 쓴다고 가정.
  if (markers.every(isJamoMarker)) {
    const cls = `[${escaped.join("")}]`;
    // ㄱ. ㄴ.… 또는 ㄱ ㄴ … (마침표 선택)
    return new RegExp(`^(${cls}+)\\.?\\s*`);
  }
  const cls = `[${escaped.join("")}]`;
  return new RegExp(`^(${cls}+)\\s*`);
}

function parseExplanationByMarkers(explanation, markers) {
  if (!explanation) return null;
  const markerSet = new Set(markers);
  const re = buildLineMarkerRegex(markers);
  const lines = explanation.split(/\r?\n/);
  const blocks = []; // { markers: string[], lines: string[] (첫 라인 마커 stripped) }
  const preamble = [];
  let current = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const isTableRow = /^\s*\|/.test(rawLine);
    if (!isTableRow) {
      const m = rawLine.match(re);
      if (m) {
        // 매치된 마커 묶음(예: "㈎㈏" 또는 "ㄱ.")
        const matched = m[1];
        // 자모는 . 가 따라오는데 character set 매치만 하므로 . 는 매치 후 trailing 으로 남는다.
        // 일단 markers 배열로 분해.
        const markerChars = [...matched].filter((c) => markerSet.has(c));
        if (markerChars.length > 0) {
          flush();
          const stripped = rawLine.slice(m[0].length);
          current = { markers: markerChars, lines: [stripped] };
          continue;
        }
      }
    }
    if (current) {
      current.lines.push(rawLine);
    } else {
      preamble.push(rawLine);
    }
  }
  flush();

  if (blocks.length === 0) return null;

  const perMarker = new Map();
  for (const b of blocks) {
    const text = b.lines.join("\n").trim();
    if (!text) continue;
    for (const mk of b.markers) {
      const prev = perMarker.get(mk);
      perMarker.set(mk, prev ? `${prev}\n\n${text}` : text);
    }
  }
  if (perMarker.size === 0) return null;

  return {
    perMarker,
    overall: preamble.join("\n").trim() || null,
  };
}

// ---- 데이터 로드 ----
let pq = supa
  .from("problems")
  .select("problem_id, year, problem_number, explanation_md")
  .eq("format", "mc_box")
  .is("deleted_at", null)
  .not("explanation_md", "is", null);
if (PROBLEM_ID) pq = pq.eq("problem_id", PROBLEM_ID);
const { data: problems, error: pErr } = await pq;
if (pErr) { console.error(pErr); process.exit(1); }

const ids = problems.map((p) => p.problem_id);
const boxByProblem = new Map();
const CHUNK = 200;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: bs, error: bErr } = await supa
    .from("problem_box_items")
    .select("box_item_id, problem_id, position_index, marker, explanation_md")
    .in("problem_id", slice);
  if (bErr) { console.error(bErr); process.exit(1); }
  for (const b of bs ?? []) {
    const arr = boxByProblem.get(b.problem_id) ?? [];
    arr.push(b);
    boxByProblem.set(b.problem_id, arr);
  }
}

const planned = [];
const skipped = [];
for (const p of problems) {
  const items = (boxByProblem.get(p.problem_id) ?? []).sort(
    (a, b) => a.position_index - b.position_index,
  );
  if (items.length === 0) {
    skipped.push({ problem: p, reason: "no_box_items" });
    continue;
  }
  // 이미 box_item.explanation_md 가 채워진 게 있으면 스킵 (덮어쓰기 방지).
  if (items.some((it) => it.explanation_md && it.explanation_md.trim().length > 0)) {
    skipped.push({ problem: p, reason: "existing_box_explanation" });
    continue;
  }
  const markers = items.map((it) => it.marker);
  const parsed = parseExplanationByMarkers(p.explanation_md, markers);
  if (!parsed) {
    skipped.push({ problem: p, reason: "no_block_after_parse" });
    continue;
  }
  // 매핑 가능한 box_item 만 추려냄.
  const updates = [];
  for (const [marker, text] of parsed.perMarker.entries()) {
    const it = items.find((x) => x.marker === marker);
    if (!it) continue;
    updates.push({ box_item_id: it.box_item_id, marker, explanation: text });
  }
  if (updates.length === 0) {
    skipped.push({ problem: p, reason: "no_marker_match" });
    continue;
  }
  planned.push({
    problem: p,
    updates,
    overall: parsed.overall,
    coverage: `${updates.length}/${items.length}`,
  });
}

console.log(`[scan] mc_box w/ explanation: ${problems.length}`);
console.log(`[plan] 적용 예정: ${planned.length}, 스킵: ${skipped.length}`);
if (skipped.length > 0) {
  const reasons = new Map();
  for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  console.log(`[skip 사유별]`, Object.fromEntries(reasons));
}

console.log(`\n[샘플 5]`);
for (const item of planned.slice(0, 5)) {
  const { problem, updates, overall, coverage } = item;
  console.log(`  · ${problem.year} #${problem.problem_number} (${problem.problem_id}) coverage=${coverage}`);
  console.log(`    overall: ${overall ? `"${overall.slice(0, 60)}..."` : "(NULL)"}`);
  for (const u of updates) {
    console.log(`    [${u.marker}] "${u.explanation.slice(0, 80).replace(/\n/g, " ")}..."`);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] --apply 로 실제 갱신.`);
  process.exit(0);
}

// ---- 적용 ----
console.log(`\n[apply] 갱신 중...`);
let okBox = 0, okProb = 0, errs = 0;
for (const item of planned) {
  for (const u of item.updates) {
    const { error } = await supa
      .from("problem_box_items")
      .update({ explanation_md: u.explanation })
      .eq("box_item_id", u.box_item_id);
    if (error) {
      console.error(`  box ${u.box_item_id} 갱신 실패`, error);
      errs++;
    } else {
      okBox++;
    }
  }
  const { error: pE } = await supa
    .from("problems")
    .update({ explanation_md: item.overall })
    .eq("problem_id", item.problem.problem_id);
  if (pE) {
    console.error(`  problem ${item.problem.problem_id} 갱신 실패`, pE);
    errs++;
  } else {
    okProb++;
  }
}
console.log(`[done] problems=${okProb} box_items=${okBox} errs=${errs}`);
