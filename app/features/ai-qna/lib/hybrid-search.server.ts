// feat-9-002 — 하이브리드 검색 (의미 + 키워드 + 구조화 + 그래프 확장) + RRF 융합.
//
// 4 경로:
//  1. semantic  — match_content_chunks RPC (pgvector cosine)
//  2. keyword   — content_chunks.body_text ILIKE / pg_trgm
//  3. structured — 질문에서 추출한 조문/사건번호로 직접 articles/cases 조회 후 청크
//  4. graph     — 위 3경로 결과의 인접 source(article ↔ article, article ↔ case, problem ↔ case)
//
// 각 경로별 ranked list → RRF (k=60) 융합 → top-K (default 12).
// SearchHit 는 chunk_id 단위. 한 source(예: 한 판례) 의 여러 청크가 모두 후보될 수 있다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import {
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
} from "./constants";
import { type ParsedQuery, parseQuestion } from "./query-parser";

export interface SearchHit {
  chunkId: string;
  sourceType: "article" | "case" | "problem" | "textbook" | "practice" | "qna";
  sourceId: string;
  chunkIndex: number;
  lawCode: string | null;
  headingPath: string | null;
  bodyText: string;
  /** v5-④ : 1=1차 (법령·판례·문제), 2=2차 (기본서·실무서). 검색 가중치 + 답변 출처 등급. */
  authorityTier: 1 | 2;
  /** path 별 원점수 (semantic=cosine sim, keyword=trigram sim, structured=1, graph=0.5 등). */
  pathScores: Partial<Record<HitPath, number>>;
  /** RRF 합산 (path 별 1/(k+rank) 합). 최종 정렬 기준. */
  rrfScore: number;
}

/** v5-④ : 권위 등급 별 검색 가중치 (rag-lab v3 검증값). 1차 ×1.0 / 2차 ×0.7. */
const AUTHORITY_TIER_WEIGHT: Readonly<Record<1 | 2, number>> = { 1: 1.0, 2: 0.7 };

/** content_chunks 행에서 authority_tier 안전 추출 (마이그 전 행/예외 대비 default 1). */
function tierOf(raw: number | null | undefined): 1 | 2 {
  return raw === 2 ? 2 : 1;
}

export type HitPath = "semantic" | "keyword" | "structured" | "graph" | "practice_intent";

export interface HybridSearchOptions {
  topK?: number;
  /** 각 경로별 가져올 후보 수 (RRF 입력). default 20. */
  perPathK?: number;
  /** RRF 상수. 클수록 상위·하위 격차 완만. default 60. */
  rrfK?: number;
  /** 명시적 law_filter — 미지정 시 ParsedQuery 의 lawCodes 사용. */
  lawCodesOverride?: string[];
}

// ── Voyage embedding (query mode) ────────────────────────────────────────

interface VoyageEmbedResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

/**
 * 사용자 질문 → 임베딩 벡터. document 색인과 다르게 input_type='query'.
 * Voyage 미설정 시 throw — 호출부가 의미 검색 path 만 skip.
 */
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY not set");
  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: [text],
      model: EMBEDDING_MODEL,
      input_type: "query",
      output_dimension: EMBEDDING_DIMS,
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Voyage embed (query) failed ${resp.status}: ${txt.slice(0, 500)}`);
  }
  const json = (await resp.json()) as VoyageEmbedResponse;
  const first = json.data[0]?.embedding;
  if (!first || first.length !== EMBEDDING_DIMS) {
    throw new Error(`Voyage returned ${first?.length} dims, expected ${EMBEDDING_DIMS}`);
  }
  return first;
}

// ── path 1: semantic ─────────────────────────────────────────────────────

async function semanticSearch(
  client: SupabaseClient<Database>,
  queryEmbedding: number[],
  lawFilter: string[] | null,
  k: number,
  docTypeFilter: ("textbook" | "practice" | "article" | "case" | "problem")[] | null = null,
): Promise<SearchHit[]> {
  const literal = `[${queryEmbedding.join(",")}]`;
  const { data, error } = await client.rpc("match_content_chunks", {
    query_embedding: literal,
    match_k: k,
    law_filter: lawFilter ?? undefined,
    doc_type_filter: docTypeFilter ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    chunkId: r.chunk_id,
    sourceType: r.source_type as SearchHit["sourceType"],
    sourceId: r.source_id,
    chunkIndex: r.chunk_index,
    lawCode: r.law_code,
    headingPath: r.heading_path,
    bodyText: r.body_text,
    authorityTier: tierOf((r as { authority_tier?: number }).authority_tier),
    pathScores: { semantic: r.similarity },
    rrfScore: 0,
  }));
}

// ── path 2: keyword (pg_trgm) ────────────────────────────────────────────

// 너무 짧은 토큰(<2자) 은 trigram 비효율 → 제외.
function pickKeywordTokens(raw: string): string[] {
  return raw
    .replace(/[?!.,;:()\[\]{}「」『』]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2)
    .slice(0, 5); // 너무 많으면 OR 폭주
}

async function keywordSearch(
  client: SupabaseClient<Database>,
  raw: string,
  lawFilter: string[] | null,
  k: number,
): Promise<SearchHit[]> {
  const tokens = pickKeywordTokens(raw);
  if (tokens.length === 0) return [];

  // ILIKE OR — pg_trgm gin 인덱스가 자동 활용된다.
  const orExpr = tokens
    .map((t) => `body_text.ilike.%${t.replaceAll(",", " ")}%`)
    .join(",");

  let q = client
    .from("content_chunks")
    .select(
      "chunk_id, source_type, source_id, chunk_index, law_code, heading_path, body_text, authority_tier",
    )
    .or(orExpr)
    .limit(k);
  if (lawFilter && lawFilter.length > 0) {
    q = q.in("law_code", lawFilter);
  }
  const { data, error } = await q;
  if (error) throw error;

  // 점수 = 매치된 토큰 수 (간이). 추후 ts_rank 또는 trigram similarity 로 정교화.
  return (data ?? []).map((r) => {
    const lower = r.body_text.toLowerCase();
    const hits = tokens.filter((t) => lower.includes(t.toLowerCase())).length;
    return {
      chunkId: r.chunk_id,
      sourceType: r.source_type as SearchHit["sourceType"],
      sourceId: r.source_id,
      chunkIndex: r.chunk_index,
      lawCode: r.law_code,
      headingPath: r.heading_path,
      bodyText: r.body_text,
      authorityTier: tierOf(r.authority_tier),
      pathScores: { keyword: hits / Math.max(tokens.length, 1) },
      rrfScore: 0,
    };
  });
}

// ── path 3: structured (조문/사건번호 직격) ───────────────────────────────

async function structuredSearch(
  client: SupabaseClient<Database>,
  parsed: ParsedQuery,
  k: number,
): Promise<SearchHit[]> {
  const articleIds = new Set<string>();
  const caseIds = new Set<string>();

  // 조문 — (law_code, article_number) 로 articles 조회.
  if (parsed.articleNumbers.length > 0 && parsed.lawCodes.length > 0) {
    const { data: artRows } = await client
      .from("articles")
      .select("article_id, laws!inner(law_code), article_number")
      .in("article_number", parsed.articleNumbers)
      .in("laws.law_code", parsed.lawCodes)
      .is("deleted_at", null);
    for (const a of artRows ?? []) articleIds.add(a.article_id);
  } else if (parsed.articleNumbers.length > 0) {
    // 과목 미지정 — 가장 흔한 patent 로 fallback (베타). v2 에서 다중 과목.
    const { data: artRows } = await client
      .from("articles")
      .select("article_id, laws!inner(law_code), article_number")
      .in("article_number", parsed.articleNumbers)
      .eq("laws.law_code", "patent")
      .is("deleted_at", null);
    for (const a of artRows ?? []) articleIds.add(a.article_id);
  }

  // 사건번호 — cases.case_number 정확 매칭. 단독 형태("2014후2061")도 포함.
  if (parsed.caseNumbers.length > 0) {
    // ParsedQuery 의 caseNumbers 는 "대법원 2018후10844" 또는 "2014후2061" 혼재.
    // cases.case_number 는 "2018후10844" 형태로 저장됨 → 코트 prefix 제거 후 매칭.
    const normalized = parsed.caseNumbers.map((c) => {
      const m = c.match(/(\d{2,4}[다후카허헌마]\d+)/);
      return m ? m[1] : c;
    });
    const { data: caseRows } = await client
      .from("cases")
      .select("case_id, case_number")
      .in("case_number", normalized)
      .is("deleted_at", null);
    for (const c of caseRows ?? []) caseIds.add(c.case_id);
  }

  return collectChunksForSources(
    client,
    Array.from(articleIds),
    Array.from(caseIds),
    [],
    "structured",
    k,
  );
}

// ── path 4: graph (인접 source 청크) ──────────────────────────────────────

async function graphExpand(
  client: SupabaseClient<Database>,
  seedHits: SearchHit[],
  k: number,
): Promise<SearchHit[]> {
  const seedArticleIds = seedHits
    .filter((h) => h.sourceType === "article")
    .map((h) => h.sourceId);
  const seedCaseIds = seedHits
    .filter((h) => h.sourceType === "case")
    .map((h) => h.sourceId);
  const seedProblemIds = seedHits
    .filter((h) => h.sourceType === "problem")
    .map((h) => h.sourceId);

  const expandArticles = new Set<string>();
  const expandCases = new Set<string>();
  const expandProblems = new Set<string>();

  // article ↔ article (양방향 — article_a / article_b 둘 다 시드).
  if (seedArticleIds.length > 0) {
    const { data: aa } = await client
      .from("article_article_links")
      .select("article_a, article_b")
      .or(
        `article_a.in.(${seedArticleIds.join(",")}),article_b.in.(${seedArticleIds.join(",")})`,
      );
    for (const r of aa ?? []) {
      if (!seedArticleIds.includes(r.article_a)) expandArticles.add(r.article_a);
      if (!seedArticleIds.includes(r.article_b)) expandArticles.add(r.article_b);
    }
  }

  // article ↔ case.
  if (seedArticleIds.length > 0) {
    const { data: ac } = await client
      .from("article_case_links")
      .select("article_id, case_id")
      .in("article_id", seedArticleIds);
    for (const r of ac ?? []) {
      if (!seedCaseIds.includes(r.case_id)) expandCases.add(r.case_id);
    }
  }
  if (seedCaseIds.length > 0) {
    const { data: ac2 } = await client
      .from("article_case_links")
      .select("article_id, case_id")
      .in("case_id", seedCaseIds);
    for (const r of ac2 ?? []) {
      if (!seedArticleIds.includes(r.article_id))
        expandArticles.add(r.article_id);
    }
  }

  // problem ↔ case.
  if (seedProblemIds.length > 0) {
    const { data: pc } = await client
      .from("problem_case_links")
      .select("problem_id, case_id")
      .in("problem_id", seedProblemIds);
    for (const r of pc ?? []) {
      if (!seedCaseIds.includes(r.case_id)) expandCases.add(r.case_id);
    }
  }
  if (seedCaseIds.length > 0) {
    const { data: pc2 } = await client
      .from("problem_case_links")
      .select("problem_id, case_id")
      .in("case_id", seedCaseIds);
    for (const r of pc2 ?? []) {
      if (!seedProblemIds.includes(r.problem_id))
        expandProblems.add(r.problem_id);
    }
  }

  if (
    expandArticles.size === 0 &&
    expandCases.size === 0 &&
    expandProblems.size === 0
  ) {
    return [];
  }

  return collectChunksForSources(
    client,
    Array.from(expandArticles),
    Array.from(expandCases),
    Array.from(expandProblems),
    "graph",
    k,
  );
}

// ── helper: source_id 들의 청크 모음 ───────────────────────────────────────

async function collectChunksForSources(
  client: SupabaseClient<Database>,
  articleIds: string[],
  caseIds: string[],
  problemIds: string[],
  path: HitPath,
  limit: number,
): Promise<SearchHit[]> {
  const out: SearchHit[] = [];
  if (articleIds.length > 0) {
    const { data } = await client
      .from("content_chunks")
      .select(
        "chunk_id, source_type, source_id, chunk_index, law_code, heading_path, body_text, authority_tier",
      )
      .eq("source_type", "article")
      .in("source_id", articleIds)
      .limit(limit);
    for (const r of data ?? []) {
      out.push({
        chunkId: r.chunk_id,
        sourceType: "article",
        sourceId: r.source_id,
        chunkIndex: r.chunk_index,
        lawCode: r.law_code,
        headingPath: r.heading_path,
        bodyText: r.body_text,
        authorityTier: tierOf(r.authority_tier),
        pathScores: { [path]: path === "structured" ? 1 : 0.5 },
        rrfScore: 0,
      });
    }
  }
  if (caseIds.length > 0) {
    const { data } = await client
      .from("content_chunks")
      .select(
        "chunk_id, source_type, source_id, chunk_index, law_code, heading_path, body_text, authority_tier",
      )
      .eq("source_type", "case")
      .in("source_id", caseIds)
      .limit(limit);
    for (const r of data ?? []) {
      out.push({
        chunkId: r.chunk_id,
        sourceType: "case",
        sourceId: r.source_id,
        chunkIndex: r.chunk_index,
        lawCode: r.law_code,
        headingPath: r.heading_path,
        bodyText: r.body_text,
        authorityTier: tierOf(r.authority_tier),
        pathScores: { [path]: path === "structured" ? 1 : 0.5 },
        rrfScore: 0,
      });
    }
  }
  if (problemIds.length > 0) {
    const { data } = await client
      .from("content_chunks")
      .select(
        "chunk_id, source_type, source_id, chunk_index, law_code, heading_path, body_text, authority_tier",
      )
      .eq("source_type", "problem")
      .in("source_id", problemIds)
      .limit(limit);
    for (const r of data ?? []) {
      out.push({
        chunkId: r.chunk_id,
        sourceType: "problem",
        sourceId: r.source_id,
        chunkIndex: r.chunk_index,
        lawCode: r.law_code,
        headingPath: r.heading_path,
        bodyText: r.body_text,
        authorityTier: tierOf(r.authority_tier),
        pathScores: { [path]: path === "structured" ? 1 : 0.5 },
        rrfScore: 0,
      });
    }
  }
  return out;
}

// ── RRF 융합 ─────────────────────────────────────────────────────────────

/**
 * Reciprocal Rank Fusion — 각 path 의 ranked list 에서 rank 1..n 의 score 를
 * 1/(rrfK + rank) 으로 변환 후 chunk_id 기준 합산.
 *
 * @param paths path 별 결과 (이미 path 내 정렬됨)
 */
function rrfFuse(
  paths: ReadonlyArray<{ path: HitPath; hits: SearchHit[] }>,
  rrfK: number,
): SearchHit[] {
  const byChunk = new Map<string, SearchHit>();

  for (const { path, hits } of paths) {
    hits.forEach((h, rank) => {
      const existing = byChunk.get(h.chunkId);
      const contrib = 1 / (rrfK + rank + 1);
      if (existing) {
        existing.rrfScore += contrib;
        Object.assign(existing.pathScores, h.pathScores);
      } else {
        byChunk.set(h.chunkId, {
          ...h,
          rrfScore: contrib,
          pathScores: { ...h.pathScores, [path]: h.pathScores[path] ?? 0 },
        });
      }
    });
  }

  // v5-④ : 권위 등급 가중치 — 1차 ×1.0 / 2차 ×0.7 (rag-lab v3 검증값).
  // 1차 자료(법령·판례·문제) 가 답변에 우선 인용되도록. 시스템 프롬프트 4번(충돌 시 1차 우선) 과 정합.
  for (const hit of byChunk.values()) {
    hit.rrfScore *= AUTHORITY_TIER_WEIGHT[hit.authorityTier];
  }

  const out = [...byChunk.values()];
  out.sort((a, b) => b.rrfScore - a.rrfScore);
  return out;
}

// ── 메인 ─────────────────────────────────────────────────────────────────

export interface HybridSearchResult {
  parsed: ParsedQuery;
  semanticAvailable: boolean;
  hits: SearchHit[];
  perPathCounts: Record<HitPath, number>;
}

export async function hybridSearch(
  client: SupabaseClient<Database>,
  question: string,
  options: HybridSearchOptions = {},
): Promise<HybridSearchResult> {
  const topK = options.topK ?? 12;
  const perPathK = options.perPathK ?? 20;
  const rrfK = options.rrfK ?? 60;

  const parsed = parseQuestion(question);
  const lawFilter =
    options.lawCodesOverride && options.lawCodesOverride.length > 0
      ? options.lawCodesOverride
      : parsed.lawCodes.length > 0
        ? parsed.lawCodes
        : null;

  // path 1 — semantic. Voyage 키 없으면 skip.
  let semanticHits: SearchHit[] = [];
  let semanticAvailable = false;
  let qvec: number[] | null = null;
  try {
    qvec = await embedQuery(parsed.raw);
    semanticHits = await semanticSearch(client, qvec, lawFilter, perPathK);
    semanticAvailable = true;
  } catch (e) {
    console.warn(
      "[hybrid-search] semantic skip:",
      e instanceof Error ? e.message : e,
    );
  }

  // path 2 — keyword.
  const keywordHits = await keywordSearch(
    client,
    parsed.raw,
    lawFilter,
    perPathK,
  );

  // path 3 — structured.
  const structuredHits = await structuredSearch(client, parsed, perPathK);

  // path 4 — graph (위 3경로의 시드 결합 후 인접).
  const seedHits = [...semanticHits, ...keywordHits, ...structuredHits];
  const graphHits = await graphExpand(client, seedHits, perPathK);

  // v8-B1 path 5 — practice_intent.
  //   질문이 "심판편람·심사기준" 등을 명시적으로 참조할 때만 발동.
  //   doc_type_filter 로 textbook/practice 만 골라 semantic 재호출 → RRF 에 새 path 로 투입.
  //   결과적으로 b 자료(2차) 가 권위 가중치 0.7 에 눌리지 않고 top-12 에 진입할 길이 열림.
  //   noev2 같은 코퍼스 밖 질문은 practiceIntent=false 라 본 path skip → 안전성 영향 0.
  let practiceIntentHits: SearchHit[] = [];
  if (parsed.practiceIntent && qvec) {
    try {
      practiceIntentHits = await semanticSearch(
        client,
        qvec,
        lawFilter,
        perPathK,
        ["textbook", "practice"],
      );
    } catch (e) {
      console.warn(
        "[hybrid-search] practice_intent skip:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  // RRF 융합.
  const fused = rrfFuse(
    [
      { path: "semantic", hits: semanticHits },
      { path: "keyword", hits: keywordHits },
      { path: "structured", hits: structuredHits },
      { path: "graph", hits: graphHits },
      { path: "practice_intent", hits: practiceIntentHits },
    ],
    rrfK,
  );

  return {
    parsed,
    semanticAvailable,
    hits: fused.slice(0, topK),
    perPathCounts: {
      semantic: semanticHits.length,
      keyword: keywordHits.length,
      structured: structuredHits.length,
      graph: graphHits.length,
      practice_intent: practiceIntentHits.length,
    },
  };
}
