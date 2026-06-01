/**
 * 단계 ⑤-B — 평가 (v2: eval_type 분리 채점).
 *
 *   npm run eval -- [--set=default|patent|other] [--limit=N] [--judge]
 *                   [--mode=both|a_only|a_plus_b] [--no-tier-boost]
 *
 * eval_type 분기 채점:
 *   - factual      → ctxKW · ansKW · LLM judge
 *   - refusal      → 답변에 "본 시스템은 법률 5과목만 다룹니다." 발화 boolean
 *   - no_evidence  → 답변에 "자료에서 근거를 찾지 못했습니다." 발화 boolean
 *
 * 리포트는 eval_type 별로 분리 집계 (전체 평균으로 뭉뚱그리지 않음).
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../lib/index-io.js';
import { configFromEnv, embedQuery } from '../lib/embed.js';
import { hybridSearch, buildValidIdx, NO_BOOST, FULL_BOOST, type StatuteBoostOpts } from '../lib/hybrid.js';
import { generateAnswer, judgeAnswer, type CitationCtx } from '../lib/llm.js';
import {
  preSearchGate, postSearchGate, gateConfigByName, formatGateRefusal,
  type GateConfig, type GateDecision,
} from '../lib/domain-gate.js';
import { docTypeLabel, type Chunk, type DocType } from '../schema/chunk.js';
import {
  EvalItemSchema, detectExpectedBehavior,
  type EvalItem, type EvalType,
} from '../schema/eval-item.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EVAL_DIR = join(ROOT, 'eval');

type Mode = 'a_only' | 'a_plus_b';
type Args = {
  limit?: number;
  judge: boolean;
  mode: 'both' | Mode;
  set: string;
  statuteBoost: StatuteBoostOpts;
  topk: number;
  gate: 'off' | 'light' | 'strict';
  /** factual 만 / refusal·no_evidence 도 / 특정 id prefix 만 (예: "st,ca") */
  onlyIds?: string;
  /** 한 모드만 보고 싶을 때 a_only 같은 prefix filter */
  filter?: string;   // eval_type filter: "factual" 만 등
};

function parseArgs(argv: string[]): Args {
  const a: Args = { judge: false, mode: 'both', set: 'default', statuteBoost: { ...NO_BOOST }, topk: 8, gate: 'off' };
  for (const x of argv.slice(2)) {
    if (x === '--judge') a.judge = true;
    else if (x === '--statute-boost') a.statuteBoost = { ...FULL_BOOST };
    else if (x === '--boost-direct') a.statuteBoost.directBoost = true;
    else if (x === '--boost-bm25') a.statuteBoost.bm25Weight = true;
    else if (x === '--boost-diversity') a.statuteBoost.ensureDiversity = true;
    else if (x.startsWith('--limit=')) a.limit = parseInt(x.slice('--limit='.length), 10);
    else if (x.startsWith('--mode=')) a.mode = x.slice('--mode='.length) as Args['mode'];
    else if (x.startsWith('--set=')) a.set = x.slice('--set='.length);
    else if (x.startsWith('--only=')) a.onlyIds = x.slice('--only='.length);
    else if (x.startsWith('--filter=')) a.filter = x.slice('--filter='.length);
    else if (x.startsWith('--topk=')) a.topk = parseInt(x.slice('--topk='.length), 10);
    else if (x.startsWith('--gate=')) a.gate = x.slice('--gate='.length) as Args['gate'];
  }
  return a;
}

function setToFile(set: string): string {
  if (set === 'default') return 'questions.jsonl';
  if (set === 'patent') return 'questions_patent.jsonl';
  if (set === 'other') return 'questions_other.jsonl';
  if (set === 'v3') return 'questions_v3.jsonl';
  return set;   // 임의 파일명도 허용
}

function countKeywords(text: string, keywords: string[]): { hit: number; total: number; missing: string[] } {
  const t = text.toLowerCase();
  let hit = 0;
  const missing: string[] = [];
  for (const k of keywords) {
    if (t.includes(k.toLowerCase())) hit += 1;
    else missing.push(k);
  }
  return { hit, total: keywords.length, missing };
}

interface ModeResult {
  mode: Mode;
  answer: string;
  hits_doc_types: Partial<Record<DocType, number>>;
  // factual 전용
  context_kw_hit: number;
  context_kw_total: number;
  answer_kw_hit: number;
  answer_kw_total: number;
  answer_kw_missing: string[];
  judge_score?: number;
  judge_rationale?: string;
  // refusal/no_evidence 전용
  expected_behavior_met: boolean | null;
  // 공통 신호
  no_evidence_emitted: boolean;
  refusal_emitted: boolean;
  // 도메인 게이트 디버그
  gate_decision?: GateDecision;
  gate_blocked: boolean;
  input_tokens: number;
  output_tokens: number;
}

async function runMode(
  mode: Mode,
  item: EvalItem,
  loaded: Awaited<ReturnType<typeof loadIndex>>,
  qVec: Float32Array,
  judge: boolean,
  statuteBoost: StatuteBoostOpts,
  topk: number,
  gateCfg: GateConfig,
): Promise<ModeResult> {
  const { chunks, store, bm25 } = loaded;

  // ─── 1) preSearchGate ───────────────────────────────────────────
  const preGate = preSearchGate(item.question, gateCfg);
  if (preGate && !preGate.pass) {
    const refusalText = formatGateRefusal(preGate);
    const noEvOut = /자료에서\s*근거를\s*찾지\s*못했습니다/.test(refusalText);
    return {
      mode,
      answer: refusalText,
      hits_doc_types: {},
      context_kw_hit: 0, context_kw_total: 0,
      answer_kw_hit: 0, answer_kw_total: 0,
      answer_kw_missing: [],
      expected_behavior_met: null,
      no_evidence_emitted: noEvOut,
      refusal_emitted: false,
      gate_decision: preGate,
      gate_blocked: true,
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  // ─── 2) hybrid search ───────────────────────────────────────────
  const validIdx = mode === 'a_only'
    ? buildValidIdx(chunks, 'tier1_only')
    : buildValidIdx(chunks, 'all');
  const hits = hybridSearch({
    question: item.question,
    queryVector: qVec,
    chunks, store, bm25,
    k: topk,
    candidatesPerPath: 30,
    validIdx,
    applyTierWeight: true,
    statuteBoost,
  });
  const citationChunks: Chunk[] = hits.map((h) => chunks[h.idx]).filter((c): c is Chunk => !!c);
  const distribution: Partial<Record<DocType, number>> = {};
  for (const c of citationChunks) distribution[c.doc_type] = (distribution[c.doc_type] ?? 0) + 1;

  // ─── 3) postSearchGate ──────────────────────────────────────────
  const postGate = postSearchGate(item.question, chunks, hits, gateCfg);
  if (!postGate.pass) {
    const refusalText = formatGateRefusal(postGate);
    const noEvOut = /자료에서\s*근거를\s*찾지\s*못했습니다/.test(refusalText);
    return {
      mode,
      answer: refusalText,
      hits_doc_types: distribution,
      context_kw_hit: 0, context_kw_total: 0,
      answer_kw_hit: 0, answer_kw_total: 0,
      answer_kw_missing: [],
      expected_behavior_met: null,
      no_evidence_emitted: noEvOut,
      refusal_emitted: false,
      gate_decision: postGate,
      gate_blocked: true,
      input_tokens: 0,
      output_tokens: 0,
    };
  }

  // ─── 4) 정상 생성 경로 ──────────────────────────────────────────
  const contextText = citationChunks.map((c) => c.content).join('\n');
  const citations: CitationCtx[] = citationChunks.map((c, i) => ({ number: i + 1, chunk: c }));
  const ans = await generateAnswer(item.question, citations);

  const noEvOut = /자료에서\s*근거를\s*찾지\s*못했습니다/.test(ans.text);
  const refOut = /본\s*시스템은\s*법률\s*5\s*과목만\s*다룹니다/.test(ans.text);

  let result: ModeResult = {
    mode,
    answer: ans.text,
    hits_doc_types: distribution,
    context_kw_hit: 0, context_kw_total: 0,
    answer_kw_hit: 0, answer_kw_total: 0,
    answer_kw_missing: [],
    expected_behavior_met: null,
    no_evidence_emitted: noEvOut,
    refusal_emitted: refOut,
    gate_decision: postGate,
    gate_blocked: false,
    input_tokens: ans.inputTokens,
    output_tokens: ans.outputTokens,
  };

  if (item.eval_type === 'factual') {
    const ctxKw = countKeywords(contextText, item.expected_keywords);
    const ansKw = countKeywords(ans.text, item.expected_keywords);
    result = {
      ...result,
      context_kw_hit: ctxKw.hit, context_kw_total: ctxKw.total,
      answer_kw_hit: ansKw.hit, answer_kw_total: ansKw.total,
      answer_kw_missing: ansKw.missing,
    };
    if (judge) {
      const expected = item.expected_keywords.join(' / ');
      const j = await judgeAnswer(
        `핵심 키워드/포인트: ${expected}\n비고: ${item.note ?? ''}`,
        ans.text,
      );
      result.judge_score = j.score;
      result.judge_rationale = j.rationale;
      result.input_tokens += j.inputTokens;
      result.output_tokens += j.outputTokens;
    }
  } else {
    // refusal / no_evidence — 기대 행동 boolean
    result.expected_behavior_met = detectExpectedBehavior(item.eval_type, ans.text);
  }

  return result;
}

interface ItemReport {
  item: EvalItem;
  results: ModeResult[];
}

interface AggSummary {
  type: EvalType;
  count: number;
  ctx_kw_avg_pct: number;
  ans_kw_avg_pct: number;
  judge_avg: number | null;
  expected_behavior_pct: number | null;
  no_evidence_pct: number;
  refusal_pct: number;
}

function aggregate(results: ModeResult[], items: EvalItem[], type: EvalType): AggSummary {
  const pairs = results
    .map((r, i) => ({ r, item: items[i] }))
    .filter((p): p is { r: ModeResult; item: EvalItem } => !!p.item && p.item.eval_type === type);
  const N = pairs.length;
  if (N === 0) return { type, count: 0, ctx_kw_avg_pct: 0, ans_kw_avg_pct: 0, judge_avg: null, expected_behavior_pct: null, no_evidence_pct: 0, refusal_pct: 0 };
  const ctx = type === 'factual' ? avg(pairs.map((p) => p.r.context_kw_total ? 100 * p.r.context_kw_hit / p.r.context_kw_total : 0)) : 0;
  const ans = type === 'factual' ? avg(pairs.map((p) => p.r.answer_kw_total ? 100 * p.r.answer_kw_hit / p.r.answer_kw_total : 0)) : 0;
  const judges = pairs.map((p) => p.r.judge_score).filter((s): s is number => typeof s === 'number');
  const judgeAvg = judges.length ? judges.reduce((s, x) => s + x, 0) / judges.length : null;
  const behavior = type !== 'factual'
    ? 100 * pairs.filter((p) => p.r.expected_behavior_met === true).length / N
    : null;
  const noEv = 100 * pairs.filter((p) => p.r.no_evidence_emitted).length / N;
  const ref = 100 * pairs.filter((p) => p.r.refusal_emitted).length / N;
  return { type, count: N, ctx_kw_avg_pct: ctx, ans_kw_avg_pct: ans, judge_avg: judgeAvg, expected_behavior_pct: behavior, no_evidence_pct: noEv, refusal_pct: ref };
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const cfg = configFromEnv();
  if (cfg.dryRun) {
    process.stderr.write('DRY_RUN=true — eval 은 실제 호출 필요. .env 에서 false 로.\n');
    process.exit(1);
  }

  const setFile = setToFile(args.set);
  process.stdout.write(`--- loading index + eval set: ${setFile} ---\n`);
  const loaded = await loadIndex();
  const raw = await readFile(join(EVAL_DIR, setFile), 'utf8');
  let items: EvalItem[] = raw
    .split('\n').filter(Boolean)
    .map((line) => EvalItemSchema.parse(JSON.parse(line)));
  // id prefix 필터 (예: --only=st,ca → st* / ca* 만)
  if (args.onlyIds) {
    const prefixes = args.onlyIds.split(',').map((s) => s.trim()).filter(Boolean);
    items = items.filter((it) => prefixes.some((p) => it.id.startsWith(p)));
  }
  // eval_type 필터 (예: --filter=factual)
  if (args.filter) {
    const ts = args.filter.split(',').map((s) => s.trim());
    items = items.filter((it) => ts.includes(it.eval_type));
  }
  if (args.limit) items = items.slice(0, args.limit);
  process.stdout.write(`chunks=${loaded.chunks.length}  eval items=${items.length}\n`);
  // eval_type 분포 보고
  const typeCount: Record<EvalType, number> = { factual: 0, refusal: 0, no_evidence: 0 };
  for (const i of items) typeCount[i.eval_type] += 1;
  process.stdout.write(`eval_type: ${JSON.stringify(typeCount)}\n`);

  const modes: Mode[] = args.mode === 'both' ? ['a_only', 'a_plus_b'] : [args.mode];
  const reports: ItemReport[] = [];
  const t0 = Date.now();
  let totalInputTok = 0;
  let totalOutputTok = 0;

  for (const item of items) {
    process.stdout.write(`\n[${item.id}/${item.eval_type}] ${item.question.slice(0, 80)}…\n`);
    const qVec = await embedQuery(item.question, cfg);
    const results: ModeResult[] = [];
    for (const mode of modes) {
      const r = await runMode(mode, item, loaded, qVec, args.judge, args.statuteBoost, args.topk, gateConfigByName(args.gate));
      totalInputTok += r.input_tokens;
      totalOutputTok += r.output_tokens;
      const line = item.eval_type === 'factual'
        ? `ctxKW ${r.context_kw_hit}/${r.context_kw_total}  ansKW ${r.answer_kw_hit}/${r.answer_kw_total}` +
          (r.judge_score != null ? `  judge=${r.judge_score}/3` : '')
        : `expected_behavior=${r.expected_behavior_met}  (noEv=${r.no_evidence_emitted}, refusal=${r.refusal_emitted})`;
      process.stdout.write(`  ${mode}: ${line}  types=${JSON.stringify(r.hits_doc_types)}\n`);
      results.push(r);
    }
    reports.push({ item, results });
  }

  // ----- write reports -----
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir(join(EVAL_DIR, 'reports'), { recursive: true });
  const boostTag = (args.statuteBoost.directBoost ? 'd' : '') + (args.statuteBoost.bm25Weight ? 'b' : '') + (args.statuteBoost.ensureDiversity ? 'v' : '');
  const tag = `v2-${args.set}${boostTag ? '-boost' + boostTag : ''}${args.topk !== 8 ? '-k' + args.topk : ''}${args.gate !== 'off' ? '-gate' + args.gate : ''}`;
  const jsonlPath = join(EVAL_DIR, 'reports', `${tag}-${ts}.jsonl`);
  const mdPath = join(EVAL_DIR, 'reports', `${tag}-${ts}.md`);
  await writeFile(jsonlPath, reports.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');

  const md: string[] = [];
  md.push(`# Eval Report (v2 · eval_type 분리) — ${tag} · ${ts}`);
  md.push(``);
  md.push(`- 모델: ${cfg.model} (임베딩) · ${process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6'} (생성${args.judge ? ' + judge' : ''})`);
  md.push(`- set: ${args.set}  · chunks: ${loaded.chunks.length}  · items: ${items.length}  · modes: ${modes.join(', ')}`);
  md.push(`- duration: ${Date.now() - t0} ms  · usage: ${totalInputTok.toLocaleString()} in / ${totalOutputTok.toLocaleString()} out`);
  md.push(``);

  // 요약: eval_type × mode
  md.push(`## eval_type 별 분리 집계 (mode 별)`);
  for (const type of ['factual', 'refusal', 'no_evidence'] as EvalType[]) {
    const hasAny = items.some((i) => i.eval_type === type);
    if (!hasAny) continue;
    md.push(``);
    md.push(`### ${type}`);
    md.push(``);
    if (type === 'factual') {
      md.push(`| mode | n | ctxKW% | ansKW% | judge avg | noEv% (signal) |`);
      md.push(`|---|---:|---:|---:|---:|---:|`);
    } else {
      md.push(`| mode | n | expected behavior % | noEv% | refusal% |`);
      md.push(`|---|---:|---:|---:|---:|`);
    }
    for (const mode of modes) {
      const rsForMode = reports.map((r) => r.results.find((x) => x.mode === mode)).filter((x): x is ModeResult => !!x);
      const itemsAll = reports.map((r) => r.item);
      const agg = aggregate(rsForMode, itemsAll, type);
      if (type === 'factual') {
        md.push(`| **${mode}** | ${agg.count} | ${agg.ctx_kw_avg_pct.toFixed(1)}% | ${agg.ans_kw_avg_pct.toFixed(1)}% | ${agg.judge_avg != null ? agg.judge_avg.toFixed(2) : '-'} | ${agg.no_evidence_pct.toFixed(1)}% |`);
      } else {
        md.push(`| **${mode}** | ${agg.count} | ${agg.expected_behavior_pct?.toFixed(1) ?? '-'}% | ${agg.no_evidence_pct.toFixed(1)}% | ${agg.refusal_pct.toFixed(1)}% |`);
      }
    }
  }
  md.push(``);

  // doc_type 분포
  md.push(`## 인용 doc_type 분포 (mode 별 합계)`);
  md.push(``);
  md.push(`| mode | statute | case | problem | textbook | practice |`);
  md.push(`|---|---:|---:|---:|---:|---:|`);
  for (const mode of modes) {
    const rs = reports.flatMap((r) => r.results.filter((x) => x.mode === mode));
    const sum = (k: DocType) => rs.reduce((s, r) => s + (r.hits_doc_types[k] ?? 0), 0);
    md.push(`| **${mode}** | ${sum('statute')} | ${sum('case')} | ${sum('problem')} | ${sum('textbook')} | ${sum('practice')} |`);
  }
  md.push(``);

  // 항목별 상세
  md.push(`## 항목별 상세`);
  for (const r of reports) {
    md.push(``);
    md.push(`### [${r.item.id}/${r.item.eval_type}] ${r.item.question}`);
    if (r.item.expected_keywords.length) md.push(`*expected_keywords*: ${r.item.expected_keywords.join(', ')}`);
    md.push(`*requires*: ${r.item.requires}  ·  *subject*: ${r.item.subject ?? '-'}  ·  *gold*: ${r.item.gold_source?.hint ?? '-'}`);
    if (r.item.note) md.push(`*note*: ${r.item.note}`);
    md.push(``);
    for (const m of r.results) {
      md.push(`#### ${m.mode}`);
      const head = r.item.eval_type === 'factual'
        ? `ctxKW ${m.context_kw_hit}/${m.context_kw_total} · ansKW ${m.answer_kw_hit}/${m.answer_kw_total}` +
          (m.judge_score != null ? ` · judge=${m.judge_score}/3` : '')
        : `expected_behavior=${m.expected_behavior_met}  (noEv=${m.no_evidence_emitted}, refusal=${m.refusal_emitted})`;
      md.push(`- ${head}  ·  types=${JSON.stringify(m.hits_doc_types)}`);
      if (m.answer_kw_missing.length) md.push(`- missing keywords: ${m.answer_kw_missing.join(', ')}`);
      if (m.judge_rationale) md.push(`- judge: ${m.judge_rationale}`);
      md.push(``);
      md.push('```');
      md.push(m.answer);
      md.push('```');
      md.push(``);
    }
  }
  await writeFile(mdPath, md.join('\n'), 'utf8');

  process.stdout.write(`\n--- done in ${Date.now() - t0} ms ---\n`);
  process.stdout.write(`reports:\n  ${jsonlPath}\n  ${mdPath}\n`);
  process.stdout.write(`total usage: ${totalInputTok.toLocaleString()} in / ${totalOutputTok.toLocaleString()} out\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
