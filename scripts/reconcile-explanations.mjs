// problem.json 과 answer.json 의 sequential index 가 1:1 로 정렬되는 점을 이용해
// DB 의 problem 해설(전체 + choice 별)을 원본에서 다시 추출해 매칭 검사·수정.
//
// 동작:
// - problem.json paragraphs 의 stem 인덱스 + answer.json paragraphs 의 답안 블록 인덱스를 0 부터 페어링.
// - 각 DB 문제에 대해 stem text 부분 일치로 problem.json index 를 찾고,
//   동일 index 의 answer block 에서 per-choice 해설을 추출.
// - DB 의 현재 choice 해설과 비교해 mismatch 면 dry-run 보고, --apply 로 갱신.
//
// 옵션:
//   --apply           실제 갱신
//   --problem-id <ID> 단일 문제만
//   --chapter         챕터 필터 (현재 미구현 — 단지 모든 문제 스캔)

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import fs from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const pidIdx = args.indexOf("--problem-id");
const PROBLEM_ID = pidIdx >= 0 ? args[pidIdx + 1] : null;
const STEM_KEYWORD = (() => {
  const k = args.indexOf("--stem-includes");
  return k >= 0 ? args[k + 1] : null;
})();
const CHAPTER_FILTER = (() => {
  const k = args.indexOf("--chapter");
  return k >= 0 ? parseInt(args[k + 1], 10) : null;
})();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const probJson = JSON.parse(fs.readFileSync("source/_converted/problem.json", "utf8"));
const ansJson = JSON.parse(fs.readFileSync("source/_converted/answer.json", "utf8"));
const mergedJson = JSON.parse(fs.readFileSync("source/_converted/problems-merged.json", "utf8"));
const mergedArr = Array.isArray(mergedJson) ? mergedJson : (mergedJson.problems || []);

// chapter 필터: stem text 의 첫 30자 set 으로 매칭.
let mergedStemHeadSet = null;
if (CHAPTER_FILTER != null) {
  mergedStemHeadSet = new Set(
    mergedArr.filter((p) => p.chapter === CHAPTER_FILTER).map((p) =>
      (p.stem || "").replace(/\s+/g, "").slice(0, 25),
    ),
  );
  console.log(`[chapter ${CHAPTER_FILTER}] merged 문제 ${mergedStemHeadSet.size}개`);
}

// problem.json stem 인덱스
const STEM_RE = /^(\d{1,2})['’](\d{2})(변형)?(단원|종합)/;
const stems = [];
for (let i = 0; i < probJson.paragraphs.length; i++) {
  const t = probJson.paragraphs[i].text || "";
  const m = t.match(STEM_RE);
  if (!m) continue;
  stems.push({
    paraIdx: i,
    seqIdx: stems.length,
    problemNumber: parseInt(m[1], 10),
    year: 2000 + parseInt(m[2], 10),
    isVariant: !!m[3],
    scope: m[4],
    stemText: t.slice(m[0].length),
    fullText: t,
  });
}

// 청크 분할 — num 이 감소(또는 1 로 reset) 하는 지점에서 새 청크 시작.
function chunkBy(items, getNum) {
  const out = [];
  let cur = [];
  let prev = -1;
  for (const it of items) {
    const n = getNum(it);
    if (cur.length > 0 && n <= prev) {
      out.push(cur);
      cur = [];
    }
    cur.push(it);
    prev = n;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

// answer.json 블록 boundary — 정답 마커 또는 "없음/답없음" 도 boundary 로 인정.
const ANS_RE = /^(\d{1,2})\s+(?:[①②③④⑤]|답?없음)/;
const ansBlocks = [];
for (let i = 0; i < ansJson.paragraphs.length; i++) {
  const t = ansJson.paragraphs[i].text || "";
  const m = t.match(ANS_RE);
  if (!m) continue;
  ansBlocks.push({
    paraIdx: i,
    seqIdx: ansBlocks.length,
    problemNumber: parseInt(m[1], 10),
  });
}
console.log(`[index] stems=${stems.length} answers=${ansBlocks.length}`);

const stemChunks = chunkBy(stems, (s) => s.problemNumber);
const ansChunks = chunkBy(ansBlocks, (a) => a.problemNumber);
console.log(`[chunks] stem=${stemChunks.length} ans=${ansChunks.length}`);

// 청크 단위 1:1 페어링. 카운트 차이가 있으면 stem 청크 기준으로 가까운 ans 청크 선택.
// 단순화: 같은 인덱스끼리 페어링하되 카운트가 안 맞으면 끝쪽 잉여만 버림.
const stemToAnsChunk = new Map(); // stem.seqIdx -> ans block (in same chunk position)
const cmin = Math.min(stemChunks.length, ansChunks.length);
for (let ci = 0; ci < cmin; ci++) {
  const sChunk = stemChunks[ci];
  const aChunk = ansChunks[ci];
  // 청크 내 num 별 매칭 — 같은 num 의 stem ↔ ans 페어링.
  const ansByNum = new Map();
  for (const a of aChunk) {
    if (!ansByNum.has(a.problemNumber)) ansByNum.set(a.problemNumber, a);
  }
  for (const s of sChunk) {
    const a = ansByNum.get(s.problemNumber);
    if (a) stemToAnsChunk.set(s.seqIdx, a);
  }
}
console.log(`[paired] ${stemToAnsChunk.size} of ${stems.length}`);

const CIRCLED_TO_INDEX = new Map([..."①②③④⑤⑥⑦⑧⑨⑩"].map((c, i) => [c, i + 1]));

function extractAnswerBlockExplanations(blockSeqIdx) {
  const cur = ansBlocks[blockSeqIdx];
  const next = ansBlocks[blockSeqIdx + 1];
  if (!cur) return null;
  const start = cur.paraIdx + 1;
  const end = next ? next.paraIdx : ansJson.paragraphs.length;
  // 블록 내 paragraphs 를 walk 해 ① ② ③ ④ ⑤ 마커별 텍스트 분리.
  const blocks = [];
  let current = null;
  const flush = () => { if (current) { blocks.push(current); current = null; } };
  for (let k = start; k < end; k++) {
    const text = ansJson.paragraphs[k].text || "";
    const t = text.trim();
    if (!t) continue;
    if (t === "해설") continue; // separator
    // 라인 시작 마커 (① ② ③ ④ ⑤ 또는 "해설①" prefix)
    const m = text.match(/^(?:해설)?([①②③④⑤⑥⑦⑧⑨⑩]+)\s*/);
    const isTableRow = /^\s*\|/.test(text);
    if (m && !isTableRow) {
      flush();
      const indices = [...m[1]].map((c) => CIRCLED_TO_INDEX.get(c)).filter((n) => n != null);
      const stripped = text.slice(m[0].length);
      current = { indices, lines: [stripped] };
      continue;
    }
    if (current) current.lines.push(text);
  }
  flush();
  if (blocks.length === 0) return null;
  const perChoice = new Map();
  for (const b of blocks) {
    const txt = b.lines.join("\n").trim();
    if (!txt) continue;
    for (const ix of b.indices) {
      const prev = perChoice.get(ix);
      perChoice.set(ix, prev ? `${prev}\n\n${txt}` : txt);
    }
  }
  return perChoice.size > 0 ? perChoice : null;
}

function findStemMatch(prob) {
  const text = (prob.body_md || "").trim();
  if (!text) return null;
  const head = text.replace(/\s+/g, "").slice(0, 30);
  const candidates = stems.filter(
    (s) => s.problemNumber === prob.problem_number && s.year === prob.year,
  );
  for (const c of candidates) {
    const cHead = c.stemText.replace(/\s+/g, "").slice(0, 30);
    if (cHead === head) return c;
  }
  for (const c of candidates) {
    if (c.stemText.includes(text.slice(0, 20))) return c;
  }
  const probe = text.slice(0, 25);
  for (const s of stems) {
    if (s.fullText.includes(probe)) return s;
  }
  return null;
}

// choice body 키워드와 해설 본문의 overlap 점수 계산.
function scoreChoiceMatch(choiceBody, explanation) {
  if (!choiceBody || !explanation) return 0;
  // 한자/숫자/한글 단어 추출 후 4글자 이상만 비교.
  const words = (choiceBody.match(/[一-鿿a-zA-Z0-9가-힣]{4,}/g) || []).slice(0, 10);
  let hits = 0;
  for (const w of words) if (explanation.includes(w)) hits++;
  return hits;
}

// 미리 모든 answer block 에서 per-choice 추출 (캐시).
const ansPerChoiceCache = new Map();
function getAnsPerChoice(seqIdx) {
  if (ansPerChoiceCache.has(seqIdx)) return ansPerChoiceCache.get(seqIdx);
  const v = extractAnswerBlockExplanations(seqIdx);
  ansPerChoiceCache.set(seqIdx, v);
  return v;
}

// 글로벌 score 기반 — 모든 ans block 중 choice body 와 가장 잘 매칭되는 블록.
// expectedNum (problem_number) 가 일치하는 블록 우선.
function findBestAnswerBlock(stemSeqIdx, choices, expectedNum) {
  // 1차: expectedNum 일치 + score 가장 높은 블록.
  let best = null;
  // stem 위치 근처 (offset ±5) 부터 우선 검사.
  const stemPara = stems[stemSeqIdx]?.paraIdx ?? 0;
  // 모든 ans block 검사 — 단, num 일치 강제.
  for (const a of ansBlocks) {
    if (a.problemNumber !== expectedNum) continue;
    const perChoice = getAnsPerChoice(a.seqIdx);
    if (!perChoice) continue;
    let score = 0;
    for (const c of choices) {
      const exp = perChoice.get(c.choice_index);
      if (exp) score += scoreChoiceMatch(c.body_md, exp);
    }
    if (score === 0) continue;
    // 거리 보정 — 가까울수록 +1 보너스 (동점일 때 stem 근처 우선).
    const distBonus = -Math.abs(a.paraIdx - stemPara) / 1000;
    const adjScore = score + distBonus;
    if (!best || adjScore > best.adjScore) {
      best = { ai: a.seqIdx, perChoice, score, adjScore };
    }
  }
  return best;
}

// ---- DB 후보 ----
let pq = supa
  .from("problems")
  .select("problem_id, year, problem_number, body_md, format")
  .is("deleted_at", null);
if (PROBLEM_ID) pq = pq.eq("problem_id", PROBLEM_ID);
if (STEM_KEYWORD) pq = pq.ilike("body_md", `%${STEM_KEYWORD}%`);
const { data: problems, error: pErr } = await pq;
if (pErr) { console.error(pErr); process.exit(1); }

const ids = problems.map((p) => p.problem_id);
const choicesByProblem = new Map();
const CHUNK = 200;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: cs, error } = await supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, body_md, explanation_md")
    .in("problem_id", slice);
  if (error) { console.error(error); process.exit(1); }
  for (const c of cs ?? []) {
    const arr = choicesByProblem.get(c.problem_id) ?? [];
    arr.push(c);
    choicesByProblem.set(c.problem_id, arr);
  }
}

// ---- 검사 ----
const planned = []; // { problem, updates: [{ choice_id, current, correct }], status }
const skipped = [];
let mismatchCount = 0, allMatchCount = 0;

for (const p of problems) {
  if (p.format && (p.format === "mc_box" || p.format === "ox" || p.format === "blank" || p.format === "subjective")) {
    skipped.push({ problem: p, reason: "non_choice_format" });
    continue;
  }
  if (mergedStemHeadSet) {
    const head = (p.body_md || "").replace(/\s+/g, "").slice(0, 25);
    if (!mergedStemHeadSet.has(head)) {
      skipped.push({ problem: p, reason: "not_in_chapter" });
      continue;
    }
  }
  const stem = findStemMatch(p);
  if (!stem) { skipped.push({ problem: p, reason: "stem_not_found" }); continue; }
  const cs = (choicesByProblem.get(p.problem_id) ?? []).sort((a, b) => a.choice_index - b.choice_index);
  if (cs.length === 0) { skipped.push({ problem: p, reason: "no_choices" }); continue; }
  const expectedNum = p.problem_number;
  const best = findBestAnswerBlock(stem.seqIdx, cs, expectedNum);
  if (!best) { skipped.push({ problem: p, reason: "no_answer_block" }); continue; }
  if (best.score === 0) { skipped.push({ problem: p, reason: "zero_score_match" }); continue; }
  const perChoice = best.perChoice;

  // 신중 판정: 현재 DB 의 choice 해설들이 choice body 와 ALL ZERO overlap 일 때만 교체 시도.
  // --force 옵션 시 무조건 교체 (단일 문제 처리용).
  let totalCurScore = 0;
  for (const c of cs) totalCurScore += scoreChoiceMatch(c.body_md, c.explanation_md || "");
  const isClearlyWrong = FORCE || (totalCurScore === 0 && best.score >= 2);

  const updates = [];
  let allMatch = true;
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  for (const c of cs) {
    const correct = perChoice.get(c.choice_index);
    if (correct == null) continue;
    const cur = (c.explanation_md || "").trim();
    const correctTrim = correct.trim();
    if (norm(cur) === norm(correctTrim)) continue;
    const curScore = scoreChoiceMatch(c.body_md, cur);
    const newScore = scoreChoiceMatch(c.body_md, correctTrim);
    // 빈 cur → 채움.
    if (!cur && correctTrim) {
      allMatch = false;
      updates.push({ choice_id: c.choice_id, choice_index: c.choice_index, current: cur, correct: correctTrim, curScore, newScore });
      continue;
    }
    // 명확히 잘못된 경우(전체 cur score 0)에만 교체. --force 시 newScore >= curScore 면 교체.
    if (isClearlyWrong && (FORCE ? newScore >= curScore : newScore > curScore)) {
      allMatch = false;
      updates.push({ choice_id: c.choice_id, choice_index: c.choice_index, current: cur, correct: correctTrim, curScore, newScore });
    }
  }
  if (allMatch) { allMatchCount++; continue; }
  mismatchCount++;
  planned.push({ problem: p, stemHead: stem.stemText.slice(0, 50), score: best.score, updates });
}

console.log(`[scan] problems=${problems.length}, mismatches=${mismatchCount}, allMatch=${allMatchCount}, skipped=${skipped.length}`);
if (skipped.length > 0) {
  const reasons = new Map();
  for (const s of skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  console.log(`[skip 사유별]`, Object.fromEntries(reasons));
}

console.log(`\n[샘플 mismatch 5]`);
for (const item of planned.slice(0, 5)) {
  console.log(`  · ${item.problem.year} #${item.problem.problem_number} pid=${item.problem.problem_id}`);
  console.log(`    stem (json): ${item.stemHead}`);
  console.log(`    stem (db):   ${(item.problem.body_md||"").slice(0, 50)}`);
  for (const u of item.updates.slice(0, 3)) {
    console.log(`    [${u.choice_index}] cur="${u.current.slice(0, 50)}" → new="${u.correct.slice(0, 50)}"`);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] --apply 로 적용. mismatch ${planned.length} 문제 / ${planned.reduce((s, p) => s + p.updates.length, 0)} choice 갱신.`);
  process.exit(0);
}

console.log(`\n[apply] 갱신 중...`);
let okCh = 0, errs = 0;
for (const item of planned) {
  for (const u of item.updates) {
    const { error } = await supa
      .from("problem_choices")
      .update({ explanation_md: u.correct })
      .eq("choice_id", u.choice_id);
    if (error) { console.error(error); errs++; }
    else okCh++;
  }
}
console.log(`[done] choices=${okCh} errs=${errs}`);
