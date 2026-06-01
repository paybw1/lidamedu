/**
 * 단계 ⑤-A — 질의 CLI.
 *
 *   npm run ask -- "<질문>"  [--k=8] [--mode=all|tier1_only|tier2_only]
 *                          [--no-tier-weight] [--retrieval-only]
 *
 * 출력:
 *   1) 검색 결과 (출처 + 점수 + RRF 디버그)
 *   2) Claude 답변 (출처 인용 + 가드레일). --retrieval-only 면 생략.
 */
import { loadIndex } from '../lib/index-io.js';
import { configFromEnv, embedQuery } from '../lib/embed.js';
import { hybridSearch, buildValidIdx, NO_BOOST, FULL_BOOST, type RetrievalMode, type StatuteBoostOpts } from '../lib/hybrid.js';
import { generateAnswer, type CitationCtx } from '../lib/llm.js';
import { docTypeLabel } from '../schema/chunk.js';

type Args = {
  question: string;
  k: number;
  mode: RetrievalMode;
  tierWeight: boolean;
  retrievalOnly: boolean;
  statuteBoost: StatuteBoostOpts;
};
function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const a: Args = { question: '', k: 8, mode: 'all', tierWeight: true, retrievalOnly: false, statuteBoost: { ...NO_BOOST } };
  for (const x of argv.slice(2)) {
    if (x === '--no-tier-weight') a.tierWeight = false;
    else if (x === '--retrieval-only') a.retrievalOnly = true;
    else if (x === '--statute-boost') a.statuteBoost = { ...FULL_BOOST };
    else if (x === '--boost-direct') a.statuteBoost.directBoost = true;
    else if (x === '--boost-bm25') a.statuteBoost.bm25Weight = true;
    else if (x === '--boost-diversity') a.statuteBoost.ensureDiversity = true;
    else if (x.startsWith('--k=')) a.k = parseInt(x.slice('--k='.length), 10);
    else if (x.startsWith('--mode=')) a.mode = x.slice('--mode='.length) as RetrievalMode;
    else positional.push(x);
  }
  a.question = positional.join(' ').trim();
  return a;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (!args.question) {
    process.stderr.write('usage: npm run ask -- "<질문>"\n');
    process.exit(1);
  }
  const t0 = Date.now();

  process.stdout.write('--- loading index ---\n');
  const { chunks, store, bm25 } = await loadIndex();
  process.stdout.write(`chunks=${chunks.length}  mode=${args.mode}  tier-weight=${args.tierWeight}\n`);

  const cfg = configFromEnv();
  if (cfg.dryRun) {
    process.stderr.write('DRY_RUN=true 이면 임베딩 호출이 zero vector 가 됩니다. .env 에서 false 로.\n');
    process.exit(1);
  }

  process.stdout.write('--- embedding query ---\n');
  const qVec = await embedQuery(args.question, cfg);

  process.stdout.write('--- hybrid search ---\n');
  const hits = hybridSearch({
    question: args.question,
    queryVector: qVec,
    chunks, store, bm25,
    k: args.k,
    candidatesPerPath: 30,
    validIdx: buildValidIdx(chunks, args.mode),
    applyTierWeight: args.tierWeight,
    statuteBoost: args.statuteBoost,
  });

  process.stdout.write(`\n=== retrieval (top ${hits.length}) ===\n`);
  hits.forEach((h, i) => {
    const c = chunks[h.idx];
    if (!c) return;
    const ranks = [];
    if (h.vecRank != null) ranks.push(`V#${h.vecRank + 1}`);
    if (h.bm25Rank != null) ranks.push(`B#${h.bm25Rank + 1}`);
    process.stdout.write(
      `[${i + 1}] (${ranks.join(' ')}, rrf=${h.score.toFixed(4)})  [${docTypeLabel(c.doc_type)}/T${c.authority_tier}]  ${c.source}\n`,
    );
    process.stdout.write(`    ${c.content.replace(/\s+/g, ' ').slice(0, 140)}…\n`);
  });

  if (args.retrievalOnly) {
    process.stdout.write(`\n--- retrieval-only mode · ${Date.now() - t0} ms ---\n`);
    return;
  }

  // Claude 답변
  process.stdout.write('\n--- generating answer ---\n');
  const citations: CitationCtx[] = hits
    .map((h, i) => {
      const c = chunks[h.idx];
      if (!c) return null;
      return { number: i + 1, chunk: c };
    })
    .filter((x): x is CitationCtx => x !== null);
  const ans = await generateAnswer(args.question, citations);
  process.stdout.write(`\n=== answer ===\n${ans.text}\n`);
  process.stdout.write(`\n--- usage: input ${ans.inputTokens} tok / output ${ans.outputTokens} tok · ${Date.now() - t0} ms ---\n`);
}

main().catch((e) => {
  process.stderr.write(`ERROR: ${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
