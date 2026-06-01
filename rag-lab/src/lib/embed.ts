/**
 * Voyage AI 임베딩 클라이언트 — `voyage-3-large` (1024-dim).
 *
 * 직접 fetch 호출 (별도 SDK 없음).
 *   POST https://api.voyageai.com/v1/embeddings
 *   { model, input[], input_type, output_dimension }
 *
 * batch 호출 + 지수 백오프 재시도. dry-run 시 호출 없이 zero vector 반환.
 */
import 'dotenv/config';

const ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const MAX_RETRIES = 5;

export type EmbedInputType = 'document' | 'query';

export interface EmbedConfig {
  apiKey: string;
  model: string;          // voyage-3-large
  dim: number;            // 1024
  dryRun: boolean;
  batchSize: number;      // texts per request
  sleepMsBetweenCalls: number;
}

export function configFromEnv(): EmbedConfig {
  const apiKey = process.env.VOYAGE_API_KEY ?? '';
  const model = process.env.VOYAGE_MODEL ?? 'voyage-3-large';
  const dim = parseInt(process.env.VOYAGE_DIM ?? '1024', 10);
  const dryRun = (process.env.DRY_RUN ?? '').toLowerCase() === 'true';
  return {
    apiKey,
    model,
    dim,
    dryRun,
    batchSize: 64,
    sleepMsBetweenCalls: 120,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function embedBatch(
  texts: string[],
  inputType: EmbedInputType,
  cfg: EmbedConfig,
): Promise<{ embeddings: number[][]; usage: { total_tokens: number } }> {
  if (cfg.dryRun) {
    return {
      embeddings: texts.map(() => new Array(cfg.dim).fill(0)),
      usage: { total_tokens: 0 },
    };
  }
  if (!cfg.apiKey) {
    throw new Error('VOYAGE_API_KEY 가 .env 에 비어 있습니다.');
  }
  const body = {
    input: texts,
    model: cfg.model,
    input_type: inputType,
    output_dimension: cfg.dim,
  };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = await res.json() as {
        data: { embedding: number[]; index: number }[];
        usage: { total_tokens: number };
      };
      // index 순서로 정렬
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return {
        embeddings: sorted.map((d) => d.embedding),
        usage: json.usage,
      };
    }
    // retryable: 429, 5xx
    if (res.status === 429 || res.status >= 500) {
      const wait = Math.min(30000, 1000 * 2 ** attempt);
      lastErr = new Error(`Voyage ${res.status}: ${await res.text().catch(() => '')}`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Voyage HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  throw lastErr ?? new Error('Voyage 임베딩 실패 (재시도 초과)');
}

export async function embedDocuments(
  texts: string[],
  cfg: EmbedConfig,
  onProgress?: (done: number, total: number, usedTokens: number) => void,
): Promise<{ vectors: Float32Array[]; totalTokens: number }> {
  const vectors: Float32Array[] = [];
  let totalTokens = 0;
  for (let i = 0; i < texts.length; i += cfg.batchSize) {
    const slice = texts.slice(i, i + cfg.batchSize);
    const { embeddings, usage } = await embedBatch(slice, 'document', cfg);
    for (const e of embeddings) vectors.push(Float32Array.from(e));
    totalTokens += usage.total_tokens;
    onProgress?.(Math.min(i + slice.length, texts.length), texts.length, totalTokens);
    if (!cfg.dryRun && i + cfg.batchSize < texts.length) await sleep(cfg.sleepMsBetweenCalls);
  }
  return { vectors, totalTokens };
}

export async function embedQuery(text: string, cfg: EmbedConfig): Promise<Float32Array> {
  const { embeddings } = await embedBatch([text], 'query', cfg);
  const first = embeddings[0];
  if (!first) throw new Error('Voyage 임베딩 결과 비어있음');
  return Float32Array.from(first);
}
