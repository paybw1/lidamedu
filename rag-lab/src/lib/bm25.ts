/**
 * BM25 (Okapi) — 외부 의존 0, 한국어 친화 tokenizer 사용.
 * 청크 수 ~7000 규모에선 직접 구현이 가장 단순·빠르다.
 *
 * 저장 포맷 (JSON):
 *   { k1, b, avgdl, df: [[term, count], ...], doclen: number[] }
 * 본문 토큰 전체는 저장하지 않는다 — 검색 시 청크 본문에서 재토크나이즈.
 * (인덱스 크기 절감 + 본문 hash 매칭 보장)
 */
import { tokenize } from './tokenize-text.js';

export interface Bm25Model {
  k1: number;
  b: number;
  N: number;
  avgdl: number;
  df: Map<string, number>;
  idf: Map<string, number>;
  doclen: number[];
}

export interface Bm25Save {
  k1: number;
  b: number;
  N: number;
  avgdl: number;
  df: [string, number][];
  idf: [string, number][];
  doclen: number[];
}

export function buildBm25(docs: string[]): Bm25Model {
  const k1 = 1.5;
  const b = 0.75;
  const N = docs.length;
  const df = new Map<string, number>();
  const doclen: number[] = new Array(N);
  let sumLen = 0;
  for (let i = 0; i < N; i++) {
    const doc = docs[i] ?? '';
    const tokens = tokenize(doc);
    doclen[i] = tokens.length;
    sumLen += tokens.length;
    const seen = new Set<string>();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const avgdl = N > 0 ? sumLen / N : 0;
  const idf = new Map<string, number>();
  for (const [t, d] of df) {
    idf.set(t, Math.log((N - d + 0.5) / (d + 0.5) + 1));
  }
  return { k1, b, N, avgdl, df, idf, doclen };
}

/** score: query → top-k (idx, score) 정렬 결과. */
export function bm25Search(
  model: Bm25Model,
  docs: string[],
  query: string,
  k: number,
): { idx: number; score: number }[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const scores: { idx: number; score: number }[] = [];
  for (let i = 0; i < model.N; i++) {
    const doc = docs[i] ?? '';
    const dTokens = tokenize(doc);
    if (dTokens.length === 0) continue;
    // tf 계산 (query token 만)
    const tf = new Map<string, number>();
    for (const t of dTokens) {
      if (qTokens.includes(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    if (tf.size === 0) continue;
    const dl = model.doclen[i] ?? dTokens.length;
    let s = 0;
    for (const qt of qTokens) {
      const f = tf.get(qt) ?? 0;
      if (!f) continue;
      const idf = model.idf.get(qt) ?? 0;
      const num = f * (model.k1 + 1);
      const denom = f + model.k1 * (1 - model.b + model.b * (dl / Math.max(model.avgdl, 1)));
      s += idf * (num / denom);
    }
    if (s > 0) scores.push({ idx: i, score: s });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k);
}

export function saveBm25(model: Bm25Model): Bm25Save {
  return {
    k1: model.k1,
    b: model.b,
    N: model.N,
    avgdl: model.avgdl,
    df: Array.from(model.df.entries()),
    idf: Array.from(model.idf.entries()),
    doclen: model.doclen,
  };
}

export function loadBm25(save: Bm25Save): Bm25Model {
  return {
    k1: save.k1,
    b: save.b,
    N: save.N,
    avgdl: save.avgdl,
    df: new Map(save.df),
    idf: new Map(save.idf),
    doclen: save.doclen,
  };
}
