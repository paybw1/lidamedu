/**
 * 하이브리드 검색 — 벡터 + BM25 → RRF 융합 → 권위 가중치 → top-K.
 *
 * 권위 가중치는 후처리: doc_type 별 multiplier (tier 1 × 1.0, tier 2 × TIER2_WEIGHT).
 * RRF k 상수는 표준 60.
 *
 * v2 조문 검색 쏠림 보정 (statuteBoost):
 *   (a) directBoost: 질문에서 추출된 조문번호와 매칭되는 statute 청크에 RRF 점수 + 1/(RRF_K+1) 추가
 *   (b) bm25Weight: statute 청크의 BM25 RRF 기여분에 ×1.3
 *   (c) ensureDiversity: 최종 top-K 에 statute 가 0 이면 후보 중 최상위 statute 1건을 강제 삽입
 */
import type { Chunk, AuthorityTier } from '../schema/chunk.js';
import { vectorSearch, type VectorStore } from './vectors.js';
import { bm25Search, type Bm25Model } from './bm25.js';
import { extractArticleRefs, type ArticleRef } from './article-ref.js';

const RRF_K = 60;
export const TIER2_WEIGHT = 0.7;
const STATUTE_BM25_BOOST = 1.3;
const DIRECT_MATCH_BONUS = 1 / (RRF_K + 1);     // 첫 등수 RRF 기여와 동량 bonus

export interface SearchHit {
  idx: number;
  score: number;
  vecRank: number | null;
  bm25Rank: number | null;
  vecScore: number | null;
  bm25Score: number | null;
}

export interface StatuteBoostOpts {
  directBoost: boolean;
  bm25Weight: boolean;
  ensureDiversity: boolean;
}

export const NO_BOOST: StatuteBoostOpts = { directBoost: false, bm25Weight: false, ensureDiversity: false };
export const FULL_BOOST: StatuteBoostOpts = { directBoost: true, bm25Weight: true, ensureDiversity: true };

export interface HybridSearchInput {
  question: string;
  queryVector: Float32Array;
  chunks: Chunk[];
  store: VectorStore;
  bm25: Bm25Model;
  k: number;                            // 최종 반환 수
  candidatesPerPath: number;            // 각 경로 후보 수 (벡터/BM25 각각)
  validIdx: Set<number> | null;         // null = 전 청크. 모드별 필터 (예: tier 1 only).
  applyTierWeight: boolean;
  statuteBoost: StatuteBoostOpts;
}

/** statute 청크의 meta.article_number 가 ref 와 매칭되는지. law_code 도 일치하면 가산점. */
function statuteMatchesRef(chunk: Chunk, refs: ArticleRef[]): boolean {
  if (chunk.doc_type !== 'statute' || chunk.meta.doc_type !== 'statute') return false;
  for (const r of refs) {
    if (r.article !== chunk.meta.article_number) continue;
    if (r.law_code && chunk.meta.law_code && r.law_code !== chunk.meta.law_code) continue;
    return true;
  }
  return false;
}

function tierWeight(tier: AuthorityTier, apply: boolean): number {
  if (!apply) return 1.0;
  return tier === 1 ? 1.0 : TIER2_WEIGHT;
}

export function hybridSearch(input: HybridSearchInput): SearchHit[] {
  const filter = input.validIdx;
  // 충분히 후보를 뽑은 뒤 필터링
  const vecAll = vectorSearch(input.store, input.queryVector, input.candidatesPerPath * 3);
  const bmAll = bm25Search(input.bm25, input.chunks.map((c) => c.content), input.question, input.candidatesPerPath * 3);

  const vec = (filter ? vecAll.filter((h) => filter.has(h.idx)) : vecAll).slice(0, input.candidatesPerPath);
  const bm = (filter ? bmAll.filter((h) => filter.has(h.idx)) : bmAll).slice(0, input.candidatesPerPath);

  // 조문 참조 추출 (직격 부스트·다양성 보정에 사용)
  const refs = (input.statuteBoost.directBoost || input.statuteBoost.ensureDiversity)
    ? extractArticleRefs(input.question)
    : [];

  const acc = new Map<number, SearchHit>();
  const upsert = (idx: number): SearchHit => {
    let h = acc.get(idx);
    if (!h) {
      h = { idx, score: 0, vecRank: null, bm25Rank: null, vecScore: null, bm25Score: null };
      acc.set(idx, h);
    }
    return h;
  };
  vec.forEach((h, rank) => {
    const e = upsert(h.idx);
    e.vecRank = rank;
    e.vecScore = h.score;
    e.score += 1 / (RRF_K + rank + 1);
  });
  bm.forEach((h, rank) => {
    const e = upsert(h.idx);
    e.bm25Rank = rank;
    e.bm25Score = h.score;
    let contribution = 1 / (RRF_K + rank + 1);
    // (b) statute BM25 가중치
    if (input.statuteBoost.bm25Weight) {
      const c = input.chunks[h.idx];
      if (c?.doc_type === 'statute') contribution *= STATUTE_BM25_BOOST;
    }
    e.score += contribution;
  });

  // (a) 조문 직격 부스트 — 매칭 statute 청크 모두에 가산
  if (input.statuteBoost.directBoost && refs.length > 0) {
    for (let i = 0; i < input.chunks.length; i++) {
      if (filter && !filter.has(i)) continue;
      const c = input.chunks[i];
      if (!c) continue;
      if (statuteMatchesRef(c, refs)) {
        const e = upsert(i);
        e.score += DIRECT_MATCH_BONUS;
      }
    }
  }

  // 권위 가중치
  let out = Array.from(acc.values()).map((h) => {
    const c = input.chunks[h.idx];
    if (!c) return h;
    return { ...h, score: h.score * tierWeight(c.authority_tier, input.applyTierWeight) };
  });
  out.sort((a, b) => b.score - a.score);

  let topK = out.slice(0, input.k);

  // (c) 다양성 보정 — top-K 에 statute 가 없으면 후보 중 최상위 statute 1건을 마지막 슬롯에 강제 삽입
  if (input.statuteBoost.ensureDiversity && topK.length > 0) {
    const hasStatute = topK.some((h) => {
      const c = input.chunks[h.idx];
      return c?.doc_type === 'statute';
    });
    if (!hasStatute) {
      const bestStatute = out.find((h) => {
        const c = input.chunks[h.idx];
        return c?.doc_type === 'statute';
      });
      if (bestStatute) {
        topK = [...topK.slice(0, input.k - 1), bestStatute];
      }
    }
  }
  return topK;
}

/** validIdx 빌더 — 모드별 필터. */
export type RetrievalMode = 'all' | 'tier1_only' | 'tier2_only';

export function buildValidIdx(chunks: Chunk[], mode: RetrievalMode): Set<number> | null {
  if (mode === 'all') return null;
  const tier: AuthorityTier = mode === 'tier1_only' ? 1 : 2;
  const set = new Set<number>();
  chunks.forEach((c, i) => {
    if (c.authority_tier === tier) set.add(i);
  });
  return set;
}
