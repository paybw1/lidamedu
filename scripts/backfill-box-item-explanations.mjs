// 박스형 문제의 box_item 별 해설 백필 — answer.json (해설편) 에서 직접 추출.
//
// 배경:
// - 기존 import 단계에서 첫 ㈎ 해설만 problems.explanation_md 에 캡처되고 ㈏㈐㈑㈒ 는 누락.
// - 누락된 marker 해설은 answer.json 의 paragraphs 에 별도 줄로 남아있음.
//
// 동작:
// - DB 의 mc_box 문제 중 일부 box_item.explanation_md 가 NULL 인 케이스 대상.
// - 첫 채워진 box_item 의 explanation 본문을 anchor 로 answer.json paragraphs 에서 위치 식별.
// - anchor 다음 paragraphs (다음 문제 boundary 직전까지) 에서 marker(㈎/㉠/ㄱ/㉮/㈀) 를
//   prefix 로 가진 줄을 찾아 marker→텍스트 매핑.
// - 누락된 box_item 만 update.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import fs from "node:fs";

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

const answerJson = JSON.parse(
  fs.readFileSync("source/_converted/answer.json", "utf8"),
);
const paragraphs = answerJson.paragraphs;

// 문제 boundary: 라인이 "NN [①②③④⑤]" 로 시작.
// 해설은 boundary 다음부터 다음 boundary 직전까지.
const PROBLEM_BOUNDARY_RE = /^\d{1,2}\s+[①②③④⑤]/;
const boundaries = [];
for (let i = 0; i < paragraphs.length; i++) {
  if (PROBLEM_BOUNDARY_RE.test(paragraphs[i].text || "")) boundaries.push(i);
}
boundaries.push(paragraphs.length);
console.log(`[answer] paragraphs=${paragraphs.length}, boundaries=${boundaries.length - 1}`);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// anchor (첫 box_item explanation) 텍스트로 boundary 위치 찾기.
function findBoundaryByAnchor(anchorText) {
  if (!anchorText) return -1;
  // anchor 첫 30~80 자 사용.
  const cleaned = anchorText.replace(/^[✕○Ｘx]\s*[,，]?\s*/, "").trim();
  const probe = cleaned.slice(0, 30);
  if (probe.length < 5) return -1;
  for (let bi = 0; bi < boundaries.length - 1; bi++) {
    const start = boundaries[bi];
    const end = boundaries[bi + 1];
    for (let k = start; k < end; k++) {
      if ((paragraphs[k].text || "").includes(probe)) return bi;
    }
  }
  return -1;
}

function buildMarkerLineRegex(markers) {
  const escaped = markers.map(escapeRegex);
  const allJamo = markers.every((m) => /^[ㄱ-ㅎ]$/.test(m));
  // 해설 prefix 가 있을 수 있어 옵셔널로 매치.
  const prefix = "(?:해설)?";
  if (allJamo) {
    return new RegExp(`^${prefix}([${escaped.join("")}]+)\\.?\\s*`);
  }
  return new RegExp(`^${prefix}([${escaped.join("")}]+)\\s*`);
}

function extractByMarkers(boundaryIdx, markers) {
  const start = boundaries[boundaryIdx];
  const end = boundaries[boundaryIdx + 1];
  const re = buildMarkerLineRegex(markers);
  const markerSet = new Set(markers);
  const blocks = []; // { markers: string[], lines: string[] }
  let current = null;
  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };
  // boundary 라인 (NN ①) 자체는 skip. 다음부터.
  for (let k = start + 1; k < end; k++) {
    const text = paragraphs[k].text || "";
    if (text.trim() === "" || text.trim() === "해설") {
      // 빈 줄·별도 "해설" 만 있는 paragraph 는 separator — 현재 블록 유지.
      continue;
    }
    const m = text.match(re);
    if (m) {
      const matched = m[1];
      const charsArr = [...matched].filter((c) => markerSet.has(c));
      if (charsArr.length > 0) {
        flush();
        const stripped = text.slice(m[0].length);
        current = { markers: charsArr, lines: [stripped] };
        continue;
      }
    }
    if (current) current.lines.push(text);
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
  return perMarker.size > 0 ? perMarker : null;
}

// ---- DB 후보 ----
let pq = supa
  .from("problems")
  .select("problem_id, year, problem_number, body_md")
  .eq("format", "mc_box")
  .is("deleted_at", null);
if (PROBLEM_ID) pq = pq.eq("problem_id", PROBLEM_ID);
const { data: problems, error: pErr } = await pq;
if (pErr) { console.error(pErr); process.exit(1); }

const ids = problems.map((p) => p.problem_id);
const boxByProblem = new Map();
const CHUNK = 200;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: bs, error } = await supa
    .from("problem_box_items")
    .select("box_item_id, problem_id, position_index, marker, explanation_md")
    .in("problem_id", slice);
  if (error) { console.error(error); process.exit(1); }
  for (const b of bs ?? []) {
    const arr = boxByProblem.get(b.problem_id) ?? [];
    arr.push(b);
    boxByProblem.set(b.problem_id, arr);
  }
}

// ---- 분류·매칭 ----
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
  const filled = items.filter((it) => it.explanation_md && it.explanation_md.trim().length > 0);
  const missing = items.filter((it) => !it.explanation_md || it.explanation_md.trim().length === 0);
  if (missing.length === 0) {
    skipped.push({ problem: p, reason: "all_filled" });
    continue;
  }
  // anchor 후보 — 첫 채워진 explanation → 첫 box_item body → 문제 본문.
  const anchorCandidates = [];
  if (filled[0]) anchorCandidates.push(filled[0].explanation_md);
  if (items[0]?.body_md) anchorCandidates.push(items[0].body_md);
  if (p.body_md) anchorCandidates.push(p.body_md);
  let bIdx = -1;
  for (const a of anchorCandidates) {
    bIdx = findBoundaryByAnchor(a);
    if (bIdx >= 0) break;
  }
  if (bIdx < 0) {
    skipped.push({ problem: p, reason: filled.length === 0 ? "no_anchor" : "anchor_not_found" });
    continue;
  }
  const markers = items.map((it) => it.marker);
  const perMarker = extractByMarkers(bIdx, markers);
  if (!perMarker) {
    skipped.push({ problem: p, reason: "no_blocks_extracted" });
    continue;
  }
  // 누락된 box_item 에만 적용.
  const updates = [];
  for (const it of missing) {
    const text = perMarker.get(it.marker);
    if (text && text.trim().length > 0) {
      updates.push({ box_item_id: it.box_item_id, marker: it.marker, explanation: text.trim() });
    }
  }
  if (updates.length === 0) {
    skipped.push({ problem: p, reason: "no_missing_match" });
    continue;
  }
  planned.push({ problem: p, updates, totalItems: items.length, missingCount: missing.length });
}

console.log(`[scan] mc_box: ${problems.length}, planned: ${planned.length}, skipped: ${skipped.length}`);
if (skipped.length > 0) {
  const reasons = new Map();
  for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  console.log(`[skip 사유별]`, Object.fromEntries(reasons));
  console.log("[skip 상세]");
  for (const s of skipped) {
    if (["no_anchor", "anchor_not_found", "no_blocks_extracted", "no_missing_match"].includes(s.reason)) {
      console.log(`  · ${s.problem.year} #${s.problem.problem_number} ${s.reason} pid=${s.problem.problem_id}`);
    }
  }
}
console.log(`\n[샘플 5]`);
for (const item of planned.slice(0, 5)) {
  console.log(`  · ${item.problem.year} #${item.problem.problem_number} (${item.problem.problem_id})`);
  for (const u of item.updates) {
    console.log(`    [${u.marker}] "${u.explanation.slice(0, 100).replace(/\n/g, " ")}…"`);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] --apply 로 적용.`);
  process.exit(0);
}

console.log(`\n[apply] 갱신 중...`);
let okBox = 0, errs = 0;
for (const item of planned) {
  for (const u of item.updates) {
    const { error } = await supa
      .from("problem_box_items")
      .update({ explanation_md: u.explanation })
      .eq("box_item_id", u.box_item_id);
    if (error) { console.error(error); errs++; }
    else okBox++;
  }
}
console.log(`[done] box_items=${okBox} errs=${errs}`);
