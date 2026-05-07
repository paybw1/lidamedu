// problems.explanation_md 가 사실상 ①②③④⑤ 별 지문 해설을 한 덩어리로 담고 있는 케이스를
// 파싱해서 problem_choices.explanation_md 로 분할.
//
// 동작 규칙:
// - 라인 시작이 "①" / "①②" / "②③④" 등 연속된 circled-number 마커 + 공백 + 텍스트인 경우 새 블록 시작.
// - 표 행(`| ... |`) 안의 마커는 무시 (현재 블록에 누적).
// - 첫 마커 이전의 라인들은 preamble → problems.explanation_md 에 보존.
// - 첫 라인 + 마커 사이의 leading 마커 prefix 는 stripped (각 choice 카드에서 라벨 중복 제거).
// - ㉠/㈀/ㄱ 등 박스/잠음 마커는 건드리지 않음 (단답형 본문에 보기묶음으로 쓰일 뿐 choice 매핑이 아님).
// - 이미 explanation_md 가 비어있지 않은 choice 가 있으면 해당 problem 전체 스킵 (덮어쓰기 방지).
//
// 사용:
//   node scripts/split-explanation-by-choice.mjs            # dry-run
//   node scripts/split-explanation-by-choice.mjs --apply    # 실제 적용
//   node scripts/split-explanation-by-choice.mjs --problem-id <UUID>
//   node scripts/split-explanation-by-choice.mjs --limit 5

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : null;
const pidIdx = args.indexOf("--problem-id");
const PROBLEM_ID = pidIdx >= 0 ? args[pidIdx + 1] : null;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("env 미설정 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
const CIRCLED_TO_INDEX = new Map(
  [...CIRCLED].map((ch, i) => [ch, i + 1]),
);

// 라인 시작 마커 regex — 연속된 circled-number 1개 이상 + 공백 + 본문.
// 표 행 (| 로 시작) 은 별도로 제외.
const MARKER_LINE_RE = new RegExp(`^([${CIRCLED}]+)\\s+(.*)$`);

function parseExplanation(explanation, choiceCount) {
  if (!explanation) return null;
  const lines = explanation.split(/\r?\n/);
  const blocks = []; // { indices: number[], lines: string[] } — 첫 라인은 마커 stripped
  const preamble = [];
  let current = null;

  const flush = () => {
    if (current) {
      blocks.push(current);
      current = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    const isTableRow = /^\s*\|/.test(line);
    if (!isTableRow) {
      const m = line.match(MARKER_LINE_RE);
      if (m) {
        flush();
        const markers = [...m[1]];
        const indices = markers
          .map((ch) => CIRCLED_TO_INDEX.get(ch))
          .filter((n) => n != null);
        current = { indices, lines: [m[2]] };
        continue;
      }
    }
    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  flush();

  if (blocks.length === 0) return null;

  // indices 가 실제 choice 범위 안인지 검증 + 텍스트 합치기.
  const perChoice = new Map();
  let outOfRange = false;
  for (const b of blocks) {
    const text = b.lines.join("\n").trim();
    if (!text) continue;
    for (const idx of b.indices) {
      if (idx < 1 || idx > choiceCount) {
        outOfRange = true;
        continue;
      }
      const prev = perChoice.get(idx);
      perChoice.set(idx, prev ? `${prev}\n\n${text}` : text);
    }
  }
  if (perChoice.size === 0) return null;

  const overall = preamble.join("\n").trim();
  return {
    perChoice,
    overall: overall || null,
    outOfRange,
  };
}

// ---- 데이터 로드 ----
let problemsQ = supa
  .from("problems")
  .select("problem_id, problem_number, explanation_md")
  .is("deleted_at", null)
  .not("explanation_md", "is", null);
if (PROBLEM_ID) problemsQ = problemsQ.eq("problem_id", PROBLEM_ID);
const { data: problems, error: pErr } = await problemsQ;
if (pErr) {
  console.error("problems 로드 실패", pErr);
  process.exit(1);
}

const candidates = (problems ?? []).filter((p) =>
  /^[①②③④⑤⑥⑦⑧⑨⑩]+\s/.test(p.explanation_md ?? ""),
);
const sliced = LIMIT ? candidates.slice(0, LIMIT) : candidates;

console.log(
  `[scan] explanation 보유 = ${problems?.length ?? 0}, ① 시작 후보 = ${candidates.length}, 처리 대상 = ${sliced.length}`,
);

// 후보 문제들의 choice 일괄 로드 — Supabase 기본 1000 row 제한 우회를 위해 problem_id 청크 단위로.
const ids = sliced.map((p) => p.problem_id);
const choicesByProblem = new Map();
const CHUNK = 200;
for (let i = 0; i < ids.length; i += CHUNK) {
  const slice = ids.slice(i, i + CHUNK);
  if (slice.length === 0) continue;
  const { data: chunk, error: cErr } = await supa
    .from("problem_choices")
    .select("choice_id, problem_id, choice_index, explanation_md")
    .in("problem_id", slice);
  if (cErr) {
    console.error("problem_choices 로드 실패", cErr);
    process.exit(1);
  }
  for (const c of chunk ?? []) {
    const arr = choicesByProblem.get(c.problem_id) ?? [];
    arr.push(c);
    choicesByProblem.set(c.problem_id, arr);
  }
}

// ---- 분류 ----
const planned = []; // { problem, parsed, choiceMap, newOverall }
const skipped = []; // { problem, reason }
let stats = {
  parsed: 0,
  noBlock: 0,
  outOfRange: 0,
  conflictExisting: 0,
  noChoiceMatch: 0,
  willUpdateProblems: 0,
  willUpdateChoices: 0,
};

for (const p of sliced) {
  const cs = (choicesByProblem.get(p.problem_id) ?? []).sort(
    (a, b) => a.choice_index - b.choice_index,
  );
  const choiceCount = cs.length;
  if (choiceCount === 0) {
    skipped.push({ problem: p, reason: "no_choices" });
    continue;
  }
  const parsed = parseExplanation(p.explanation_md, choiceCount);
  if (!parsed) {
    skipped.push({ problem: p, reason: "no_block_after_parse" });
    stats.noBlock++;
    continue;
  }
  if (parsed.outOfRange) stats.outOfRange++;

  // 충돌 검사: 이미 explanation_md 가 있는 choice 중에서 우리가 채우려는 index 와 겹치는 게 있는지.
  const conflicts = [];
  for (const idx of parsed.perChoice.keys()) {
    const ch = cs.find((c) => c.choice_index === idx);
    if (!ch) continue;
    if (ch.explanation_md && ch.explanation_md.trim().length > 0) {
      conflicts.push(idx);
    }
  }
  if (conflicts.length > 0) {
    skipped.push({
      problem: p,
      reason: `existing_choice_explanation: indices=${conflicts.join(",")}`,
    });
    stats.conflictExisting++;
    continue;
  }

  // 매핑 가능한 choice 가 하나도 없으면 스킵.
  const choiceMap = []; // { choice_id, choice_index, explanation }
  for (const [idx, txt] of parsed.perChoice.entries()) {
    const ch = cs.find((c) => c.choice_index === idx);
    if (!ch) continue;
    choiceMap.push({ choice_id: ch.choice_id, choice_index: idx, explanation: txt });
  }
  if (choiceMap.length === 0) {
    skipped.push({ problem: p, reason: "no_matching_choice" });
    stats.noChoiceMatch++;
    continue;
  }

  planned.push({
    problem: p,
    parsed,
    choiceMap,
    newOverall: parsed.overall, // null 이면 problems.explanation_md 를 NULL 로.
  });
  stats.parsed++;
  stats.willUpdateProblems++;
  stats.willUpdateChoices += choiceMap.length;
}

console.log(`[plan] 적용 예정 문제: ${planned.length}, 스킵: ${skipped.length}`);
console.log(`       choice 갱신 예정: ${stats.willUpdateChoices}`);
if (stats.outOfRange) console.log(`       out-of-range 마커 발견(부분 손실): ${stats.outOfRange}`);
if (stats.conflictExisting)
  console.log(`       기존 choice.explanation_md 충돌(스킵): ${stats.conflictExisting}`);
if (stats.noBlock) console.log(`       파싱 결과 블록 0개(스킵): ${stats.noBlock}`);
if (stats.noChoiceMatch) console.log(`       매핑 가능 choice 0개(스킵): ${stats.noChoiceMatch}`);

// 스킵 사유별 집계.
if (skipped.length > 0) {
  const byReason = new Map();
  for (const s of skipped) {
    const key = s.reason.split(":")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  console.log(`[skip 사유별]`, Object.fromEntries(byReason));
}

// 샘플 미리보기 — 첫 5개.
console.log(`\n[샘플 미리보기 first 5]`);
for (const item of planned.slice(0, 5)) {
  const { problem, choiceMap, newOverall } = item;
  console.log(`  · #${problem.problem_number ?? "?"} (${problem.problem_id})`);
  console.log(`    overall: ${newOverall ? `"${newOverall.slice(0, 60)}..."` : "(NULL)"}`);
  for (const cm of choiceMap) {
    console.log(`    [${cm.choice_index}] "${cm.explanation.slice(0, 80).replace(/\n/g, " ")}..."`);
  }
}

if (!APPLY) {
  console.log(`\n[dry-run] --apply 를 붙여 실제 갱신.`);
  process.exit(0);
}

// ---- 적용 ----
console.log(`\n[apply] 갱신 중...`);
let okP = 0, okC = 0, errP = 0, errC = 0;
for (const item of planned) {
  // choices 먼저 갱신.
  for (const cm of item.choiceMap) {
    const { error } = await supa
      .from("problem_choices")
      .update({ explanation_md: cm.explanation })
      .eq("choice_id", cm.choice_id);
    if (error) {
      console.error(`  choice ${cm.choice_id} 갱신 실패`, error);
      errC++;
    } else {
      okC++;
    }
  }
  // 그 다음 problems.explanation_md 갱신.
  const { error: pE } = await supa
    .from("problems")
    .update({ explanation_md: item.newOverall })
    .eq("problem_id", item.problem.problem_id);
  if (pE) {
    console.error(`  problem ${item.problem.problem_id} 갱신 실패`, pE);
    errP++;
  } else {
    okP++;
  }
}

console.log(
  `[done] problem 갱신 ok=${okP} err=${errP}, choice 갱신 ok=${okC} err=${errC}`,
);
