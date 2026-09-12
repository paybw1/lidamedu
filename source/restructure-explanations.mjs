#!/usr/bin/env node
/**
 * restructure-explanations.mjs
 *
 * 기존 해설 본문을 스키마 필드로 재구조화합니다.
 * 법적 내용은 새로 만들지 않습니다. 쪼개기만 합니다.
 *
 * 설계 원칙
 *   - DB 에 붙지 않습니다. JSONL 입출력만 합니다.
 *     입력 추출과 결과 적재는 기존 run-prod-sql.mjs / service-role 경로를 쓰세요.
 *   - 기본이 파일럿(30건)입니다. --all 을 줘야 전량이 돕니다.
 *   - 검증은 결정론적입니다. 모델 자기보고를 믿지 않습니다.
 *
 * 사용법
 *   # 1) 입력 추출 (기존 경로로)
 *   #    SELECT problem_id AS id, subject, explanation_md AS body
 *   #      FROM public.problems
 *   #     WHERE deleted_at IS NULL AND explanation_md IS NOT NULL
 *   #       AND subject = '민법'
 *   #     ORDER BY md5(problem_id::text) LIMIT 30;
 *   #    -> JSONL 로 저장 (한 줄에 {id, subject, body})
 *   #
 *   # 2) 실행
 *   export ANTHROPIC_API_KEY=...
 *   node restructure-explanations.mjs --in pilot.jsonl --out pilot.out.jsonl
 *
 *   # 전량
 *   node restructure-explanations.mjs --in all.jsonl --out all.out.jsonl --all
 *
 * 산출물
 *   <out>              성공분 JSONL
 *   <out>.rejected     검증 실패분 (사유 포함)
 *   <out>.report.md    집계 리포트
 */

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 설정 ────────────────────────────────────────────────────────────────
const MODEL = 'claude-sonnet-4-6';
const CONCURRENCY = 4;
const PILOT_N = 30;
const LEN_RATIO_MIN = 0.70;
const LEN_RATIO_MAX = 1.40;
const MAX_RETRY = 2;

// 사건부호. ★다자 부호를 반드시 앞에 둔다 — '다카' 가 '다' 뒤에 오면 영영 안 걸린다.
//   2026-09-12 파일럿에서 84다카722 가 '신규 사건번호' 로 잡혔다(부호 자체가 빠져 있었다).
const CASE_CODES = [
  '재다', '재후', '재누', '헌가', '헌나', '헌마', '헌바', '헌사', '헌아',
  '가합', '가단', '가소', '구합', '구단', '고합', '고단', '고정',
  '즈합', '즈단', '즈기', '카합', '카단', '카기', '드합', '드단', '다카',
  '나', '다', '두', '누', '도', '므', '드', '르', '스', '마', '그', '후', '허',
  '라', '노', '로', '비', '오', '초', '카',
].join('|');
const RE_CASE = new RegExp(`\\d{2,4}\\s*(?:${CASE_CODES})\\s*\\d+`, 'g');
// 병합 표기("91마256·257", "2006다38161, 38178")의 꼬리 번호를 집는다.
// ★날짜("2008. 5. 29.")를 삼키지 않도록 꼬리 숫자 뒤에 마침표·숫자가 오면 제외한다.
const RE_CASE_MERGED = new RegExp(
  '(\\d{2,4})\\s*(' + CASE_CODES + ')\\s*\\d+((?:\\s*[,·]\\s*\\d{2,6}(?![.\\d]))+)',
  'g',
);
const RE_ARTICLE = /제\s*\d+\s*조(?:\s*의\s*\d+)?/g;

const norm = (s) => String(s).replace(/\s+/g, '');
const extract = (text, re) =>
  new Set([...String(text ?? '').matchAll(re)].map((m) => norm(m[0])));

// ★refs 배열도 **본문과 같은 정규식으로** 뽑는다. 그대로 norm 만 하면 모델이 지시대로
//   표기를 보존한 "민법 제303조" 가 본문의 "제303조" 와 안 맞아, 같은 조문이 '추가됨' 과
//   '유실' 로 **동시에** 잡힌다. 2026-09-12 파일럿 통과율 3.3% 의 원인이 이것이었다.
const extractAll = (arr, re) => {
  const out = new Set();
  for (const v of arr ?? []) for (const x of extract(v, re)) out.add(x);
  return out;
};

/**
 * 병합 표기의 꼬리를 앞머리에 붙여 **별칭**을 만든다("91마256·257" → 91마257).
 * ★별칭은 **용서에만 쓴다** — 있는 것으로 쳐서 '추가됨' 을 막되 '유실' 로는 묻지 않는다.
 *   원문과 출력의 글이 달라 한쪽에서만 펼쳐질 수 있어, 요구하면 거꾸로 오탐이 난다.
 */
const caseAliases = (text) => {
  const out = new Set();
  for (const m of String(text ?? '').matchAll(RE_CASE_MERGED)) {
    for (const t of m[3].split(/[,·]/)) {
      const d = t.trim();
      if (d) out.add(norm(m[1] + m[2] + d));
    }
  }
  return out;
};

// ── 프롬프트 ────────────────────────────────────────────────────────────
const SYSTEM = `당신은 변리사 시험 대비 해설을 구조화하는 편집자입니다.

절대 규칙:
1. 입력에 없는 법적 내용을 추가하지 마십시오. 조문 번호, 사건번호, 법리를 새로 만들면 안 됩니다.
2. 입력에 있는 모든 조문 표기와 사건번호를 출력에 그대로 보존하십시오. 표기 형태도 바꾸지 마십시오.
3. 당신의 작업은 재배치이지 집필이 아닙니다. 문장을 다듬는 정도는 허용되나 정보를 더하거나 빼지 마십시오.
4. 해당 내용이 입력에 없으면 그 필드는 null 로 두십시오. 채우려고 지어내지 마십시오.

출력은 JSON 객체 하나만. 마크다운 코드펜스나 설명 없이 JSON 만 출력하십시오.

{
  "conclusion": "정답 판단과 그 핵심 근거. 2~3문장. 필수.",
  "reasoning": "상세 해설 본문. 필수.",
  "statute_refs": ["제33조", "제29조의2"],
  "case_refs": ["2001다4981"],
  "pitfall": "함정·주의·유의 내용. 입력에 없으면 null.",
  "unsplittable": false
}

conclusion 과 reasoning 으로 나눌 수 없는 구조라면 reasoning 에 전문을 넣고
conclusion 을 null, unsplittable 을 true 로 두십시오. 억지로 나누지 마십시오.`;

function userPrompt(row) {
  return `과목: ${row.subject ?? '미상'}

--- 해설 원문 ---
${row.body}
--- 끝 ---

위 해설을 스키마에 따라 재구조화하십시오.`;
}

// ── API ─────────────────────────────────────────────────────────────────
async function callModel(row) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(row) }],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(clean);
}

// ── 결정론적 검증 ───────────────────────────────────────────────────────
function validate(row, out) {
  const errs = [];   // 막는다 — 정보가 더해지거나 빠진 경우
  const warns = [];  // 알린다 — 사람이 보면 되는 경우

  if (!out || typeof out !== 'object') return { errs: ['출력이 객체가 아님'], warns };
  if (!out.reasoning || !String(out.reasoning).trim()) errs.push('reasoning 비어 있음');
  if (!out.unsplittable && !out.conclusion) errs.push('conclusion 누락 (unsplittable 아님)');

  const combined = [out.conclusion, out.reasoning, out.pitfall].filter(Boolean).join('\n');
  const refText = [...(out.statute_refs ?? []), ...(out.case_refs ?? [])].join(' ');

  // 1. 조문 집합 일치
  const inArt = extract(row.body, RE_ARTICLE);
  const outArt = new Set([
    ...extract(combined, RE_ARTICLE),
    ...extractAll(out.statute_refs, RE_ARTICLE),
  ]);
  const artAdded = [...outArt].filter((x) => !inArt.has(x));
  const artLost = [...inArt].filter((x) => !outArt.has(x));
  if (artAdded.length) errs.push(`조문 추가됨: ${artAdded.join(', ')}`);
  if (artLost.length) errs.push(`조문 유실: ${artLost.join(', ')}`);

  // 2. 사건번호 집합 일치 — 병합 표기의 꼬리는 별칭으로 용서한다.
  const inCase = extract(row.body, RE_CASE);
  const outCase = new Set([
    ...extract(combined, RE_CASE),
    ...extractAll(out.case_refs, RE_CASE),
  ]);
  const inOk = new Set([...inCase, ...caseAliases(row.body)]);
  const outOk = new Set([...outCase, ...caseAliases(combined), ...caseAliases(refText)]);
  const caseAdded = [...outCase].filter((x) => !inOk.has(x));
  const caseLost = [...inCase].filter((x) => !outOk.has(x));
  if (caseAdded.length) errs.push(`사건번호 추가됨: ${caseAdded.join(', ')}`);
  if (caseLost.length) errs.push(`사건번호 유실: ${caseLost.join(', ')}`);

  // 3. 길이비 — **경고로만** 둔다. 파일럿 30건 실측(2026-09-12):
  //      combined/body            min 0.66 · p50 1.02 · max 1.77   ← 이걸 쓴다
  //      (combined+refs)/body     min 0.92 · p50 1.20 · max 2.11   refs 가 본문에도 남아 이중계상
  //      본문(각주 제거) 대비      min 1.63 · p50 1.98 · max 6.04   각주가 본문의 절반이라 무의미
  //      인용 걷어낸 산문만        min 1.34 · p50 1.71 · max 2.53
  //    ★산문 비율이 1.0 이 될 수 없는 건 스키마가 **일부러 중복**시키기 때문이다 —
  //      conclusion 은 reasoning 의 요약이고 pitfall 은 오답 분석의 재진술이다.
  //      그래서 길이비는 약한 신호다. 실패 사유로 쓰면 안 되고, 밴드도 실측(0.70~1.40)에 맞춘다.
  const ratio = combined.length / Math.max(row.body.length, 1);
  if (ratio < LEN_RATIO_MIN) warns.push(`내용 축소 의심 (비율 ${ratio.toFixed(2)})`);
  if (ratio > LEN_RATIO_MAX) warns.push(`내용 증식 의심 (비율 ${ratio.toFixed(2)})`);

  // 4. pitfall 근거 — 낱말 매칭은 대리지표일 뿐이다. 객관식 해설에서 함정은
  //    **오답 선지 분석 그 자체**여서 「함정·주의·유의」라는 말이 나오지 않는다.
  //    파일럿 6건을 사람이 원문과 대조한 결과 전부 근거가 있었다 → 경고로 강등.
  const hadPitfallMarker = /(함정|주의|유의)/.test(row.body);
  if (out.pitfall && !hadPitfallMarker) warns.push('pitfall 마커 없음 (사람 확인 권장)');

  return { errs, warns };
}

// ── 실행 ────────────────────────────────────────────────────────────────
async function readJsonl(p) {
  const rows = [];
  const rl = readline.createInterface({ input: createReadStream(p), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (t) rows.push(JSON.parse(t));
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const inPath = get('--in');
  const outPath = get('--out') ?? 'restructured.jsonl';
  const all = args.includes('--all');

  if (!inPath) { console.error('--in <file.jsonl> 필요'); process.exit(1); }
  if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY 필요'); process.exit(1); }

  let rows = await readJsonl(inPath);
  if (!all) {
    rows = rows.slice(0, PILOT_N);
    console.log(`파일럿 모드: ${rows.length}건. 전량은 --all.\n`);
  }

  const ok = [];
  const bad = [];
  let done = 0;

  async function worker(queue) {
    while (queue.length) {
      const row = queue.shift();
      let attempt = 0, out = null, errs = ['미시도'], warns = [];
      while (attempt <= MAX_RETRY) {
        try {
          out = await callModel(row);
          ({ errs, warns } = validate(row, out));
          if (!errs.length) break;
        } catch (e) {
          errs = [`호출 실패: ${e.message}`];
          warns = [];
        }
        attempt++;
      }
      if (!errs.length) ok.push({ ...row, restructured: out, warnings: warns });
      else bad.push({ id: row.id, subject: row.subject, errors: errs, warnings: warns, output: out });
      done++;
      if (done % 10 === 0 || done === rows.length) {
        process.stdout.write(`\r진행 ${done}/${rows.length}  성공 ${ok.length}  실패 ${bad.length}`);
      }
    }
  }

  const queue = [...rows];
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
  console.log('\n');

  await fs.writeFile(outPath, ok.map((r) => JSON.stringify(r)).join('\n'), 'utf8');
  await fs.writeFile(`${outPath}.rejected`, bad.map((r) => JSON.stringify(r)).join('\n'), 'utf8');

  // 리포트
  const tally = {};
  for (const b of bad) for (const e of b.errors) {
    const k = e.split(':')[0].split('(')[0].trim();
    tally[k] = (tally[k] ?? 0) + 1;
  }
  const wtally = {};
  for (const r of [...ok, ...bad]) for (const w of r.warnings ?? []) {
    const k = w.split(':')[0].split('(')[0].trim();
    wtally[k] = (wtally[k] ?? 0) + 1;
  }
  const unsplit = ok.filter((r) => r.restructured.unsplittable).length;
  const withPitfall = ok.filter((r) => r.restructured.pitfall).length;

  const R = [
    '# 재구조화 리포트', '',
    `대상 ${rows.length}건 · 통과 ${ok.length} (${((ok.length / rows.length) * 100).toFixed(1)}%) · 실패 ${bad.length}`,
    '',
    `분할 불가(unsplittable) ${unsplit}건 (${((unsplit / Math.max(ok.length, 1)) * 100).toFixed(1)}%)`,
    `pitfall 보유 ${withPitfall}건`,
    '', '## 실패 사유', '',
    '| 사유 | 건수 |', '|---|---|',
    ...Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    '', '## 경고(막지 않음 · 사람이 볼 것)', '',
    '| 사유 | 건수 |', '|---|---|',
    ...Object.entries(wtally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    '', '## 판단 기준', '',
    '- 통과율 90% 미만이면 프롬프트가 아니라 필드 정의를 의심하세요.',
    '- unsplittable 이 30% 넘으면 conclusion/reasoning 분리를 포기하고 단일 필드로 가는 게 낫습니다.',
    '- 「사건번호 추가됨」이 하나라도 있으면 전량 실행 금지. 환각이 실재합니다.',
    '  ★단 부호 누락·표기 차이로도 뜬다. 실제 토큰을 먼저 눈으로 보세요(2026-09-12 오탐 7건).',
    '- 「조문 유실」이 많으면 max_tokens 부족일 수 있으니 길이 분포부터 확인하세요.',
    '- 경고는 통과를 막지 않습니다. 길이비·pitfall 은 실패 사유가 아니라 관찰 지표입니다.',
  ];
  await fs.writeFile(`${outPath}.report.md`, R.join('\n'), 'utf8');

  console.log(`통과 ${ok.length} / 실패 ${bad.length}`);
  console.log(`  ${outPath}\n  ${outPath}.rejected\n  ${outPath}.report.md`);
}

// 검증기만 따로 채점해 볼 수 있게 내보낸다(모델을 다시 부르지 않는 회귀 검사용).
export { validate, extract, extractAll, caseAliases, RE_CASE, RE_ARTICLE, RE_CASE_MERGED };

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => { console.error('실패:', e.message); process.exit(1); });
}
