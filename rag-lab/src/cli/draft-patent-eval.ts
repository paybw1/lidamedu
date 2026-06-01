/**
 * 단계 v2-② — 특허법 평가셋 30+ 초안 자동 생성.
 *
 *   npm run draft-eval
 *
 * 인덱스에서 patent 청크를 카테고리별로 샘플링 → Claude 에 컨텍스트로 주고
 * factual 문항을 생성. refusal/no_evidence 4문항은 손작성으로 합쳐 출력.
 *
 * 출력: eval/questions_patent.jsonl.draft  (사용자 검수 후 .draft 제거)
 *
 * 카테고리:
 *   - statute       (조문 근거) ~10
 *   - case          (판례 근거) ~8
 *   - b_required    (기본서·실무서 필수) ~8
 *   - refusal/no_evidence (손작성) 4
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../lib/index-io.js';
import { EvalItemSchema, type EvalItem } from '../schema/eval-item.js';
import { docTypeLabel, type Chunk, type DocType } from '../schema/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT_PATH = join(ROOT, 'eval', 'questions_patent.jsonl.draft');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

// ---------- sampling ----------

function shuffle<T>(arr: T[], seed: number): T[] {
  // Linear congruential (deterministic across runs)
  let s = seed;
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

interface Sampled { chunks: Chunk[]; descriptor: string; }

function samplePatent(chunks: Chunk[]): Record<'statute' | 'case' | 'b', Sampled> {
  const patent = chunks.filter((c) => c.subject === 'patent');
  const statute = patent.filter((c) => c.doc_type === 'statute');
  const cases   = patent.filter((c) => c.doc_type === 'case');
  const b       = patent.filter((c) => c.doc_type === 'textbook' || c.doc_type === 'practice');

  return {
    statute: { chunks: shuffle(statute, 1).slice(0, 30), descriptor: `특허법 조문 ${statute.length} 중 30 샘플` },
    case:    { chunks: shuffle(cases, 2).slice(0, 20),   descriptor: `특허 판례 ${cases.length} 중 20 샘플` },
    b:       { chunks: shuffle(b, 3).slice(0, 24),       descriptor: `특허 기본서/실무서 ${b.length} 중 24 샘플` },
  };
}

function contextBlock(chunks: Chunk[]): string {
  return chunks
    .map((c, i) => `[${i + 1}] [${docTypeLabel(c.doc_type)}] ${c.source}\n${c.content.replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n\n---\n\n');
}

// ---------- generation ----------

const COMMON_RULES = `당신은 한국 변리사 1차/2차 시험 출제 위원입니다. 평가용 문항을 JSON Lines 형식으로 만듭니다.

규칙:
1. **반드시 제공된 자료에 근거**해 답할 수 있는 문항만 만드세요. 자료에 없는 사실을 묻지 마세요.
2. expected_keywords 는 모범답안에 반드시 등장해야 하는 명사·법조문 번호·판례 번호 등 5~8개. 너무 일반적인 단어("특허", "법") 금지.
3. 문항은 학생이 단답 또는 짧은 서술형으로 답할 수준. 너무 추상적이거나 너무 사소한 디테일 회피.
4. 출력은 **JSON Lines 만**. 각 줄이 valid JSON. 주석·코드펜스·설명 없음.
5. 각 줄 스키마:
   {"id":"<3글자 prefix + 번호>","question":"...","eval_type":"factual","expected_keywords":["...","..."],"requires":"<A_only|A_plus_B>","subject":"patent","gold_source":{"doc_type":"<statute|case|problem|textbook|practice>","hint":"<자료 라벨>"},"note":"<짧은 메모>"}
6. id 는 카테고리별로 다른 prefix 를 쓰세요 (사용자 지시에 따름).`;

async function generateCategory(args: {
  prefix: string;
  count: number;
  requires: 'A_only' | 'A_plus_B';
  goldDocType: DocType;
  categoryHint: string;
  sampled: Chunk[];
}): Promise<string> {
  const userMsg =
    `카테고리: ${args.categoryHint}\n` +
    `생성할 문항 수: ${args.count}\n` +
    `각 문항의 \`requires\`: "${args.requires}" (고정)\n` +
    `각 문항의 \`gold_source.doc_type\`: "${args.goldDocType}" (고정)\n` +
    `각 문항의 id prefix: "${args.prefix}" (예: ${args.prefix}1, ${args.prefix}2, ...)\n\n` +
    `다음은 출제 근거가 될 자료 ${args.sampled.length}개 입니다. 이 자료의 사실관계 안에서만 문항을 만드세요.\n\n` +
    contextBlock(args.sampled) +
    `\n\n위 자료에서 정확히 ${args.count}개의 문항을 생성해 JSON Lines 로 출력하세요. 다른 설명 없이 ${args.count}줄만.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: COMMON_RULES,
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  process.stdout.write(`  ${args.prefix}: ${res.usage.input_tokens} in / ${res.usage.output_tokens} out\n`);
  return text;
}

// ---------- handcrafted refusal/no_evidence ----------

const HANDCRAFTED: EvalItem[] = [
  EvalItemSchema.parse({
    id: 'ref1',
    question: '수소 원자의 바닥상태 전자가 가지는 에너지를 eV 단위로 구하세요.',
    eval_type: 'refusal',
    expected_keywords: [],
    requires: 'A_only',
    subject: null,
    gold_source: { doc_type: null, hint: '자연과학(물리·화학) — 시스템 거절이 정답' },
  }),
  EvalItemSchema.parse({
    id: 'ref2',
    question: '단백질의 일차 구조와 이차 구조의 차이를 설명하세요.',
    eval_type: 'refusal',
    expected_keywords: [],
    requires: 'A_only',
    subject: null,
    gold_source: { doc_type: null, hint: '자연과학(생물) — 시스템 거절이 정답' },
  }),
  EvalItemSchema.parse({
    id: 'noev1',
    question: '민법상 임의대리권의 소멸 사유 5가지를 열거하세요.',
    eval_type: 'no_evidence',
    expected_keywords: [],
    requires: 'A_only',
    subject: 'civil',
    gold_source: { doc_type: null, hint: '본 코퍼스에 민법 미적재 — 근거없음이 정답' },
  }),
  EvalItemSchema.parse({
    id: 'noev2',
    question: '민사소송법상 항소장의 필수적 기재사항은 무엇인가요?',
    eval_type: 'no_evidence',
    expected_keywords: [],
    requires: 'A_only',
    subject: 'civil_procedure',
    gold_source: { doc_type: null, hint: '본 코퍼스에 민사소송법 미적재 — 근거없음이 정답' },
  }),
];

// ---------- main ----------

async function main(): Promise<void> {
  process.stdout.write('--- loading index ---\n');
  const { chunks } = await loadIndex();
  const samples = samplePatent(chunks);
  process.stdout.write(`samples: statute=${samples.statute.chunks.length} case=${samples.case.chunks.length} b=${samples.b.chunks.length}\n`);

  process.stdout.write('\n--- generating per category ---\n');
  const blocks: string[] = [];

  blocks.push(await generateCategory({
    prefix: 'st',
    count: 10,
    requires: 'A_only',
    goldDocType: 'statute',
    categoryHint: '조문 근거 문항 (특허법 조문에서 답이 직접 정해진다)',
    sampled: samples.statute.chunks,
  }));

  blocks.push(await generateCategory({
    prefix: 'ca',
    count: 8,
    requires: 'A_only',
    goldDocType: 'case',
    categoryHint: '판례 근거 문항 (대법원/특허법원 판례의 판시·요지에서 답이 정해진다). expected_keywords 에 반드시 사건번호 포함.',
    sampled: samples.case.chunks,
  }));

  blocks.push(await generateCategory({
    prefix: 'b',
    count: 8,
    requires: 'A_plus_B',
    goldDocType: 'practice',
    categoryHint:
      '기본서·실무서가 있어야 답할 수 있는 문항 (조문·판례에는 명시되지 않은 절차·실무 디테일·심사·심판 운영). ' +
      '예: "심사기준에서 ~의 판단 절차", "심판편람상 ~ 서류", "기본서가 설명하는 ~의 실무적 의미". ' +
      'DB 만으로는 답이 부족하고, 기본서·실무서가 추가돼야 정확히 답할 수 있는 문항을 우선 출제.',
    sampled: samples.b.chunks,
  }));

  // parse JSONL
  const items: EvalItem[] = [];
  let raw = blocks.join('\n');
  // 일부 모델 응답에서 코드펜스가 섞이는 경우 정제
  raw = raw.replace(/```(?:json|jsonl)?\n?/g, '').replace(/```/g, '');
  const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'));
  let parseFails = 0;
  for (const line of lines) {
    try {
      items.push(EvalItemSchema.parse(JSON.parse(line)));
    } catch (e) {
      parseFails += 1;
      process.stderr.write(`  parse fail: ${line.slice(0, 80)}…  (${e instanceof Error ? e.message.split('\n')[0] : String(e)})\n`);
    }
  }
  process.stdout.write(`\nparsed: ${items.length} factual items  · parse failures: ${parseFails}\n`);

  // handcrafted 합치기
  items.push(...HANDCRAFTED);

  // write
  await writeFile(OUT_PATH, items.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');

  // summary
  const byType: Record<string, number> = {};
  const byGold: Record<string, number> = {};
  for (const i of items) {
    byType[i.eval_type] = (byType[i.eval_type] ?? 0) + 1;
    const k = i.gold_source?.doc_type ?? 'null';
    byGold[k] = (byGold[k] ?? 0) + 1;
  }
  process.stdout.write(`\n--- draft: ${items.length} items ---\n`);
  process.stdout.write(`by eval_type: ${JSON.stringify(byType)}\n`);
  process.stdout.write(`by gold_source.doc_type: ${JSON.stringify(byGold)}\n`);
  process.stdout.write(`output: ${OUT_PATH}\n`);
  process.stdout.write(`\n>>> 검수 후 .draft 제거하여 \`eval/questions_patent.jsonl\` 로 옮기세요.\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
