/**
 * 단계 v3-② 보조 — 어려운 multi-clause statute 5문항 자동 생성.
 *
 * v2 statute 카테고리에서 천장효과(9/10이 OFF에서도 3/3 만점) 보완 목적.
 * 여러 조문을 엮거나, 항·호 깊이까지 묻거나, 예외 조건을 짚는 문항을 출제.
 */
import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIndex } from '../lib/index-io.js';
import { EvalItemSchema, type EvalItem } from '../schema/eval-item.js';
import { docTypeLabel } from '../schema/chunk.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', '..', 'eval', 'hard_statute.jsonl.draft');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6';

function shuffle<T>(arr: T[], seed: number): T[] {
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

async function main(): Promise<void> {
  const { chunks } = await loadIndex();
  const statutes = chunks.filter((c) => c.subject === 'patent' && c.doc_type === 'statute');
  const sampled = shuffle(statutes, 7).slice(0, 25);

  const ctx = sampled.map((c, i) => `[${i + 1}] [${docTypeLabel(c.doc_type)}] ${c.source}\n${c.content.replace(/\s+/g, ' ').slice(0, 600)}`).join('\n\n---\n\n');
  const system = `당신은 한국 변리사 시험 출제 위원입니다. 다음 자료에서 **어려운** factual 문항 5개를 JSON Lines 로 만듭니다.

규칙:
- 단일 조항으로 답이 정해지는 단순 문항은 피하세요.
- 다음 중 하나 이상의 특징을 포함하세요: (a) 여러 조 또는 여러 항을 함께 적용해야 답할 수 있음 (b) 항·호·목 깊이까지 물음 (c) 예외 조건·단서·"다만" 부분을 정확히 짚음 (d) 기간·기한·횟수 등 수치를 다중으로 요구.
- expected_keywords 6~9개. 조문 번호·항 번호·수치를 반드시 포함.
- id prefix: st11, st12, st13, st14, st15.
- 각 줄 스키마: {"id":"...","question":"...","eval_type":"factual","expected_keywords":[...],"requires":"A_only","subject":"patent","gold_source":{"doc_type":"statute","hint":"<자료 라벨>"},"note":"<짧은 메모>"}
- JSON Lines 만, 코드펜스 없음.`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system,
    messages: [{ role: 'user', content: `다음 25개 조문 자료에서 어려운 factual 5문항을 만드세요.\n\n${ctx}\n\n5줄 JSON Lines.` }],
  });
  const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
  process.stdout.write(`usage: ${res.usage.input_tokens} in / ${res.usage.output_tokens} out\n`);

  const cleaned = text.replace(/```(?:json|jsonl)?\n?/g, '').replace(/```/g, '');
  const lines = cleaned.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('{') && l.endsWith('}'));
  const items: EvalItem[] = [];
  for (const line of lines) {
    try { items.push(EvalItemSchema.parse(JSON.parse(line))); }
    catch (e) { process.stderr.write(`parse fail: ${line.slice(0, 80)}\n`); }
  }
  await writeFile(OUT_PATH, items.map((i) => JSON.stringify(i)).join('\n') + '\n', 'utf8');
  process.stdout.write(`written ${items.length} items to ${OUT_PATH}\n`);
}
main().catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
