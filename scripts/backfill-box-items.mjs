// 박스형 문제(mc_box) 인데 import 단계에서 박스 지문(problem_box_items) 누락된 케이스 백필.
//
// 진단:
// - DB 의 problems 중 format=mc_short 인데 모든 choice 가 박스 마커 조합 (㈎㈏ / ㉠㉡ / ㈀㈁ / ㄱ ㄴ)
//   이고 problem_box_items 가 비어있는 문제 = 약 60건.
// - source/_converted/problem.json paragraphs 에서 stem 매칭 후 다음 paragraph 가 표 셀 형태로
//   ㈎ <텍스트> ㈏ <텍스트> ... 가 한 줄에 모여있음 → 마커 위치로 split 해서 추출.
//
// 동작:
// - dry-run (default): 매칭 결과만 출력
// - --apply: problem_box_items insert + problems.format='mc_box' 업데이트 + choices.ox_ineligible=true
// - --problem-id <UUID>: 단일 문제만 처리

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

// ---- 마커 패밀리 ----
// (마커 문자, regex 식별, 본문 분리 형태)
const MARKER_FAMILIES = [
  // 한글 괄호괄호 (㈎ ㈏ ㈐ ㈑ ㈒ ㈓ ㈔ ㈕ ㈖ ㈗) — U+3218..3227
  { name: "kor_paren_double", chars: "㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗", needsDot: false },
  // 한글 동그라미 자모 (㉠ ㉡ ㉢ ㉣ ㉤ ㉥ ㉦ ㉧ ㉨ ㉩) — U+3260..3269
  { name: "kor_circled_jamo", chars: "㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩", needsDot: false },
  // 한글 동그라미 음절 (㉮ ㉯ ㉰ ㉱ ㉲ ㉳ ㉴ ㉵ ㉶ ㉷ ㉸ ㉹) — U+326E..3279
  { name: "kor_circled_syl", chars: "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹", needsDot: false },
  // 한글 괄호 (㈀ ㈁ ㈂ ㈃ ㈄ ㈅ ㈆ ㈇ ㈈ ㈉) — U+3200..3209
  { name: "kor_paren", chars: "㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉", needsDot: false },
  // 한글 자모 + 점 (ㄱ. ㄴ. ㄷ. ㄹ. ㅁ. ㅂ. ㅅ. ㅇ. ㅈ.)
  { name: "jamo_dot", chars: "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ", needsDot: true },
];

function detectMarkers(text, family) {
  if (!text) return [];
  const positions = [];
  if (family.needsDot) {
    // ㄱ. (앞에 공백 또는 시작) — \s 또는 시작 위치 직후. 마침표 뒤 공백은 선택.
    const re = new RegExp(`(?:^|[\\s|])([${family.chars}])\\.\\s*`, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      positions.push({ marker: m[1], start: m.index + m[0].indexOf(m[1]), end: m.index + m[0].length });
    }
  } else {
    const re = new RegExp(`[${family.chars}]`, "g");
    let m;
    while ((m = re.exec(text)) !== null) {
      positions.push({ marker: m[0], start: m.index, end: m.index + m[0].length });
    }
  }
  return positions;
}

function pickBestFamily(text) {
  let best = null;
  for (const f of MARKER_FAMILIES) {
    const pos = detectMarkers(text, f);
    if (pos.length < 2) continue;
    if (!best || pos.length > best.positions.length) {
      best = { family: f, positions: pos };
    }
  }
  return best;
}

function parseBoxItemsFromCell(text) {
  // 표 셀 정리: 시작/끝 `|` 제거, `| --- |` 같은 separator 줄은 무시.
  const cleaned = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\|[\s\-:|]+\|?$/.test(l)) // separator 제거
    .map((l) => l.replace(/^\|/, "").replace(/\|$/, "").trim())
    .join(" ");
  const best = pickBestFamily(cleaned);
  if (!best) return null;
  const items = [];
  for (let i = 0; i < best.positions.length; i++) {
    const cur = best.positions[i];
    const next = best.positions[i + 1];
    const bodyStart = cur.end;
    const bodyEnd = next ? next.start : cleaned.length;
    let body = cleaned.slice(bodyStart, bodyEnd).trim();
    // 자모 패밀리는 marker 뒤 . 제거 안된 케이스 보정 — 매치 시 이미 . + space 까지 소비함.
    items.push({ marker: cur.marker, body });
  }
  return { family: best.family.name, items };
}

// ---- 데이터 로드 ----
const rawProblems = JSON.parse(
  fs.readFileSync("source/_converted/problem.json", "utf8"),
);
const paragraphs = rawProblems.paragraphs;

// stem 패턴 (NN'YY[변형]?(단원|종합)<stem>) 의 stem 부분만 따로 추출하기 위한 헬퍼.
const STEM_PREFIX_RE = /^(\d{1,2})['’](\d{2})(변형)?(단원|종합)/;
const stemIndex = []; // { idx, problemNumber, year, isVariant, scope, stemText }
for (let i = 0; i < paragraphs.length; i++) {
  const t = paragraphs[i].text || "";
  const m = t.match(STEM_PREFIX_RE);
  if (!m) continue;
  const stemText = t.slice(m[0].length);
  stemIndex.push({
    idx: i,
    problemNumber: parseInt(m[1], 10),
    year: 2000 + parseInt(m[2], 10),
    isVariant: !!m[3],
    scope: m[4],
    stemText,
  });
}
console.log(`[index] paragraphs: ${paragraphs.length}, stems: ${stemIndex.length}`);

// ---- DB 후보 로드 ----
// 박스 마커로 시작하는 choice 본문 판정.
const BOX_MARKER_RE = /^[㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉]|^[ㄱ-ㅎ](\s|[.,，·]|$)/;

let pq = supa
  .from("problems")
  .select("problem_id, problem_number, year, body_md, format, polarity, scope")
  .eq("format", "mc_short")
  .is("deleted_at", null);
if (PROBLEM_ID) pq = pq.eq("problem_id", PROBLEM_ID);
const { data: problems, error: pErr } = await pq;
if (pErr) { console.error(pErr); process.exit(1); }

const ids = problems.map((p) => p.problem_id);
const choicesByProblem = new Map();
const CHUNK = 200;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: cs, error: cErr } = await supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, body_md")
    .in("problem_id", slice);
  if (cErr) { console.error(cErr); process.exit(1); }
  for (const c of cs ?? []) {
    const arr = choicesByProblem.get(c.problem_id) ?? [];
    arr.push(c);
    choicesByProblem.set(c.problem_id, arr);
  }
}

const boxByProblem = new Map();
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: bs } = await supa
    .from("problem_box_items")
    .select("box_item_id, problem_id")
    .in("problem_id", slice);
  for (const b of bs ?? []) {
    const arr = boxByProblem.get(b.problem_id) ?? [];
    arr.push(b);
    boxByProblem.set(b.problem_id, arr);
  }
}

// 후보: 박스마커로 시작하는 choice 가 다수 (예: "모두 틀림" 같은 fallback choice 1개 허용) + box_items 비어있음.
const candidates = [];
for (const p of problems) {
  const cs = (choicesByProblem.get(p.problem_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
  if (cs.length === 0) continue;
  const hits = cs.filter((c) => BOX_MARKER_RE.test((c.body_md || "").trim())).length;
  if (hits < cs.length - 1 || hits < 2) continue; // 최소 (n-1) 개 + 2개 이상.
  if ((boxByProblem.get(p.problem_id) ?? []).length > 0) continue;
  candidates.push({ problem: p, choices: cs });
}
console.log(`[scan] mc_short candidates with box-marker choices & no box_items: ${candidates.length}`);

// ---- 매칭 ----
function matchStemParagraph(prob) {
  const stemText = (prob.body_md || "").trim();
  if (!stemText) return null;
  // 1) year + number 매칭(기출/변형 모두 후보) 중 stem 일치.
  const head = stemText.replace(/\s+/g, "").slice(0, 25);
  const yearNumCandidates = stemIndex.filter(
    (s) => s.problemNumber === prob.problem_number && s.year === prob.year,
  );
  for (const c of yearNumCandidates) {
    const cHead = c.stemText.replace(/\s+/g, "").slice(0, 25);
    if (cHead === head) return c;
  }
  for (const c of yearNumCandidates) {
    if (c.stemText.includes(stemText.slice(0, 20))) return c;
  }
  // 2) Fallback: stem 텍스트 substring 으로 모든 paragraph 검색 (헤더 파싱이 어긋난 케이스).
  const probe = stemText.slice(0, 30);
  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i].text || "";
    if (t.includes(probe)) {
      // year hint 가 있다면 같은 paragraph 안에 ’YY 도 있는지 가벼운 검증.
      const yyHint = `’${String(prob.year).slice(-2)}`;
      if (t.includes(yyHint) || prob.year == null) {
        return { idx: i, problemNumber: prob.problem_number, year: prob.year, isVariant: false, scope: null, stemText: t };
      }
    }
  }
  return null;
}

function findBoxParagraphAfter(stemIdx) {
  // stemIdx 다음 1-6 paragraphs 안에서 박스 마커 2+ 가 들어있는 표 셀 찾기.
  for (let j = stemIdx + 1; j < Math.min(stemIdx + 8, paragraphs.length); j++) {
    const t = paragraphs[j].text || "";
    if (!/^\|/.test(t)) continue;
    const parsed = parseBoxItemsFromCell(t);
    if (parsed && parsed.items.length >= 2) return { idx: j, parsed };
  }
  return null;
}

const planned = [];
const unmatched = [];
for (const c of candidates) {
  const stemP = matchStemParagraph(c.problem);
  if (!stemP) {
    unmatched.push({ problem: c.problem, reason: "no_stem_match" });
    continue;
  }
  const boxP = findBoxParagraphAfter(stemP.idx);
  if (!boxP) {
    unmatched.push({ problem: c.problem, reason: "no_box_paragraph", stemIdx: stemP.idx });
    continue;
  }
  // choice 본문에 등장하는 모든 마커 set 와 box items 의 marker set 을 검증.
  const choiceMarkerSet = new Set();
  for (const ch of c.choices) {
    for (const ch2 of (ch.body_md || "")) {
      if (/[㈎㈏㈐㈑㈒㈓㈔㈕㈖㈗㉠㉡㉢㉣㉤㉥㉦㉧㉨㉩㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㈀㈁㈂㈃㈄㈅㈆㈇㈈㈉ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ]/.test(ch2)) {
        choiceMarkerSet.add(ch2);
      }
    }
  }
  const boxMarkerSet = new Set(boxP.parsed.items.map((it) => it.marker));
  const missing = [...choiceMarkerSet].filter((m) => !boxMarkerSet.has(m));
  planned.push({
    problem: c.problem,
    choices: c.choices,
    stemIdx: stemP.idx,
    boxIdx: boxP.idx,
    items: boxP.parsed.items,
    family: boxP.parsed.family,
    missingMarkers: missing,
  });
}

console.log(`[plan] matched=${planned.length}, unmatched=${unmatched.length}`);
if (unmatched.length > 0) {
  const byReason = new Map();
  for (const u of unmatched) byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
  console.log(`[unmatched 사유별]`, Object.fromEntries(byReason));
  console.log(`[unmatched 샘플 5]`);
  for (const u of unmatched.slice(0, 5)) {
    console.log(`  · #${u.problem.problem_number} ${u.problem.year} ${u.reason} pid=${u.problem.problem_id}`);
  }
}

const withMissing = planned.filter((p) => p.missingMarkers.length > 0);
console.log(`[validation] choice 마커가 box 항목에 없는 문제: ${withMissing.length}`);
for (const w of withMissing.slice(0, 5)) {
  console.log(
    `  · ${w.problem.year} #${w.problem.problem_number} pid=${w.problem.problem_id} family=${w.family} missing=${JSON.stringify(w.missingMarkers)}`,
  );
}

// 샘플 출력 — 첫 5건.
console.log(`\n[샘플 5]`);
for (const p of planned.slice(0, 5)) {
  console.log(`  · ${p.problem.year} #${p.problem.problem_number} pid=${p.problem.problem_id} (family=${p.family})`);
  for (const it of p.items) {
    console.log(`    ${it.marker} ${it.body.slice(0, 80)}${it.body.length > 80 ? "…" : ""}`);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] --apply 로 실제 적용.`);
  process.exit(0);
}

// ---- 적용 ----
console.log(`\n[apply] 적용 중...`);
let okBox = 0, okProb = 0, okCh = 0, errs = 0;
for (const p of planned) {
  if (p.missingMarkers.length > 0) {
    console.log(`  skip ${p.problem.problem_id} — missing markers ${JSON.stringify(p.missingMarkers)}`);
    continue;
  }
  // 1) box items insert.
  const rows = p.items.map((it, idx) => ({
    problem_id: p.problem.problem_id,
    position_index: idx + 1,
    marker: it.marker,
    body_md: it.body,
  }));
  const { error: bErr } = await supa.from("problem_box_items").insert(rows);
  if (bErr) {
    console.error(`  box insert 실패 ${p.problem.problem_id}:`, bErr);
    errs++;
    continue;
  }
  okBox += rows.length;
  // 2) format → mc_box.
  const { error: fErr } = await supa
    .from("problems")
    .update({ format: "mc_box" })
    .eq("problem_id", p.problem.problem_id);
  if (fErr) {
    console.error(`  format 갱신 실패:`, fErr);
    errs++;
    continue;
  }
  okProb++;
  // 3) choices ox_ineligible=true (보기묶음).
  const choiceIds = p.choices.map((c) => c.choice_id);
  const { error: cErr } = await supa
    .from("problem_choices")
    .update({ ox_ineligible: true, ox_truth: null })
    .in("choice_id", choiceIds);
  if (cErr) {
    console.error(`  choice 갱신 실패:`, cErr);
    errs++;
    continue;
  }
  okCh += choiceIds.length;
}
console.log(`[done] problems=${okProb} box_items=${okBox} choices=${okCh} errs=${errs}`);
