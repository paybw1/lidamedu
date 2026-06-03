// 예상문제(또는 미연결 문제) 해설 → 조문/판례 연결 후보 생성.
//
// 우선순위 (사용자 결정 — 정확·비용 모두 최선):
//   ① source_chunk_ids → content_chunks 역추적 (비용 0, 가장 정확. AI 생성 문제에 한함)
//   ② 명시 정규식 — 문제 본문/해설/선지·박스 explanation 의 "○○법 제N조" / 사건번호
//   ③ hybridSearch RAG — ①②가 비었거나 부족할 때만, 문제 1회만 (비용·cap 가드)
//
// 자동 확정 X — 후보 + 출처 태그만 반환. 최종 결정은 강사 승인 화면에서.
// 연결 단위는 기출과 동일 — 선지별/박스별/문제 전체. 컬럼도 기존 그대로 사용.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import { parseQuestion } from "~/features/ai-qna/lib/query-parser";
import { checkAiCap, recordAiUsage } from "~/features/gs/lib/usage-tracker.server";

export type CandidateSource = "chunk" | "explicit" | "rag";

export interface ArticleCandidate {
  articleId: string;
  lawCode: string;
  articleNumber: string;
  /** "특허법 제29조" — 표시용. */
  displayLabel: string;
  /** 어느 경로에서 잡혔는지 — 여러 경로면 중복 표시(태그 chip). */
  sources: CandidateSource[];
  /** RAG path 만 의미 — RRF 점수. */
  rrfScore?: number;
}

export interface CaseCandidate {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  sources: CandidateSource[];
  rrfScore?: number;
}

export interface ChoiceCandidates {
  choiceId: string;
  choiceIndex: number;
  bodyMd: string;
  explanationMd: string | null;
  /** 이미 연결돼 있는 article (잠금 표시). */
  currentArticleId: string | null;
  currentCaseId: string | null;
  articles: ArticleCandidate[];
  cases: CaseCandidate[];
}

export interface BoxCandidates {
  boxItemId: string;
  marker: string;
  bodyMd: string;
  explanationMd: string | null;
  currentArticleId: string | null;
  currentCaseId: string | null;
  articles: ArticleCandidate[];
  cases: CaseCandidate[];
}

export interface LinkSuggestions {
  problemId: string;
  /** 문제 전체 단위 후보. primary_article_id / problem_case_links 후보에 사용. */
  perProblem: { articles: ArticleCandidate[]; cases: CaseCandidate[] };
  perChoice: ChoiceCandidates[];
  perBoxItem: BoxCandidates[];
  /** RAG skip 사유 (cap 도달 / 키 없음 / 비활성). null = 호출됨. */
  ragSkipped: string | null;
}

interface SuggestOptions {
  /** RAG 보완 검색 사용 여부. default true. */
  useRag?: boolean;
  /** 비용 가드 로깅용. */
  userId?: string | null;
}

// ── ① source_chunk_ids → content_chunks 역추적 ───────────────────────────

async function traceSourceChunks(
  client: SupabaseClient<Database>,
  chunkIds: string[],
): Promise<{ articleIds: string[]; caseIds: string[] }> {
  if (chunkIds.length === 0) return { articleIds: [], caseIds: [] };
  const { data, error } = await client
    .from("content_chunks")
    .select("source_type, source_id")
    .in("chunk_id", chunkIds);
  if (error || !data) return { articleIds: [], caseIds: [] };
  const articleIds = new Set<string>();
  const caseIds = new Set<string>();
  for (const row of data) {
    if (row.source_type === "article") articleIds.add(row.source_id);
    else if (row.source_type === "case") caseIds.add(row.source_id);
  }
  return { articleIds: [...articleIds], caseIds: [...caseIds] };
}

// ── ② 명시 정규식 ────────────────────────────────────────────────────────

interface ExplicitRefs {
  articleNumbers: Array<{ number: string; lawCode: string | null }>;
  caseNumbers: string[];
}

/**
 * problem.law_id 의 law_code 를 fallback 으로 채워 ambiguous 한 "제29조" 도 정확히 매칭.
 */
function extractExplicitRefs(text: string, problemLawCode: string | null): ExplicitRefs {
  if (!text) return { articleNumbers: [], caseNumbers: [] };
  const parsed = parseQuestion(text);
  // lawCodes 가 있으면 모든 article 에 해당 코드 부여. 없으면 problemLawCode fallback.
  const codes = parsed.lawCodes.length > 0 ? parsed.lawCodes : problemLawCode ? [problemLawCode] : [null];
  const articleNumbers: Array<{ number: string; lawCode: string | null }> = [];
  for (const num of parsed.articleNumbers) {
    for (const code of codes) {
      articleNumbers.push({ number: num, lawCode: code });
    }
  }
  return { articleNumbers, caseNumbers: parsed.caseNumbers };
}

async function resolveExplicitArticles(
  client: SupabaseClient<Database>,
  refs: Array<{ number: string; lawCode: string | null }>,
): Promise<Array<{ articleId: string; lawCode: string; articleNumber: string }>> {
  if (refs.length === 0) return [];
  // law_code 별로 그룹화 — IN 쿼리 1회로.
  const byLaw = new Map<string, Set<string>>();
  for (const r of refs) {
    if (!r.lawCode) continue;
    if (!byLaw.has(r.lawCode)) byLaw.set(r.lawCode, new Set());
    byLaw.get(r.lawCode)!.add(r.number);
  }
  const out: Array<{ articleId: string; lawCode: string; articleNumber: string }> = [];
  for (const [code, nums] of byLaw) {
    const { data: lawRow } = await client.from("laws").select("law_id").eq("law_code", code).maybeSingle();
    if (!lawRow) continue;
    const { data: arts } = await client
      .from("articles")
      .select("article_id, article_number")
      .eq("law_id", lawRow.law_id)
      .eq("level", "article")
      .in("article_number", [...nums]);
    for (const a of arts ?? []) {
      if (!a.article_number) continue;
      out.push({ articleId: a.article_id, lawCode: code, articleNumber: a.article_number });
    }
  }
  return out;
}

async function resolveExplicitCases(
  client: SupabaseClient<Database>,
  numbers: string[],
): Promise<Array<{ caseId: string; caseNumber: string }>> {
  if (numbers.length === 0) return [];
  const { data } = await client
    .from("cases")
    .select("case_id, case_number")
    .in("case_number", numbers);
  return (data ?? []).map((c) => ({ caseId: c.case_id, caseNumber: c.case_number }));
}

// ── 후보 누적 헬퍼 ───────────────────────────────────────────────────────

interface ArticleAccumulator {
  map: Map<string, ArticleCandidate>;
}

function pushArticle(
  acc: ArticleAccumulator,
  c: { articleId: string; lawCode: string; articleNumber: string; source: CandidateSource; rrfScore?: number },
): void {
  const existing = acc.map.get(c.articleId);
  if (existing) {
    if (!existing.sources.includes(c.source)) existing.sources.push(c.source);
    if (c.rrfScore !== undefined && (existing.rrfScore === undefined || c.rrfScore > existing.rrfScore)) {
      existing.rrfScore = c.rrfScore;
    }
    return;
  }
  acc.map.set(c.articleId, {
    articleId: c.articleId,
    lawCode: c.lawCode,
    articleNumber: c.articleNumber,
    displayLabel: `${LAW_LABEL[c.lawCode] ?? c.lawCode} 제${c.articleNumber}조`,
    sources: [c.source],
    rrfScore: c.rrfScore,
  });
}

interface CaseAccumulator {
  map: Map<string, CaseCandidate>;
}

function pushCase(
  acc: CaseAccumulator,
  c: { caseId: string; caseNumber: string; caseTitle?: string; source: CandidateSource; rrfScore?: number },
): void {
  const existing = acc.map.get(c.caseId);
  if (existing) {
    if (!existing.sources.includes(c.source)) existing.sources.push(c.source);
    if (c.rrfScore !== undefined && (existing.rrfScore === undefined || c.rrfScore > existing.rrfScore)) {
      existing.rrfScore = c.rrfScore;
    }
    return;
  }
  acc.map.set(c.caseId, {
    caseId: c.caseId,
    caseNumber: c.caseNumber,
    caseTitle: c.caseTitle ?? "",
    sources: [c.source],
    rrfScore: c.rrfScore,
  });
}

const LAW_LABEL: Record<string, string> = {
  patent: "특허법",
  trademark: "상표법",
  design: "디자인보호법",
  civil: "민법",
  "civil-procedure": "민사소송법",
};

// 출처 우선순위 — 정렬용 (chunk > explicit > rag).
function sourcePriority(sources: CandidateSource[]): number {
  if (sources.includes("chunk")) return 3;
  if (sources.includes("explicit")) return 2;
  return 1;
}

function sortArticles(items: ArticleCandidate[]): ArticleCandidate[] {
  return [...items].sort((a, b) => {
    const ap = sourcePriority(a.sources);
    const bp = sourcePriority(b.sources);
    if (bp !== ap) return bp - ap;
    return (b.rrfScore ?? 0) - (a.rrfScore ?? 0);
  });
}

function sortCases(items: CaseCandidate[]): CaseCandidate[] {
  return [...items].sort((a, b) => {
    const ap = sourcePriority(a.sources);
    const bp = sourcePriority(b.sources);
    if (bp !== ap) return bp - ap;
    return (b.rrfScore ?? 0) - (a.rrfScore ?? 0);
  });
}

// ── 메인 ─────────────────────────────────────────────────────────────────

export async function suggestLinksForProblem(
  client: SupabaseClient<Database>,
  problemId: string,
  opts: SuggestOptions = {},
): Promise<LinkSuggestions> {
  const useRag = opts.useRag ?? true;

  // 문제 + 자식 일괄 로딩.
  const { data: prob, error: pErr } = await client
    .from("problems")
    .select(`
      problem_id, law_id, body_md, explanation_md, source_chunk_ids,
      laws:law_id(law_code)
    `)
    .eq("problem_id", problemId)
    .single();
  if (pErr || !prob) throw new Error(`problem not found: ${problemId}`);
  const problemLawCode = (prob.laws as { law_code: string } | null)?.law_code ?? null;
  const sourceChunkIds = (prob.source_chunk_ids as string[] | null) ?? [];

  const { data: choicesRaw } = await client
    .from("problem_choices")
    .select("choice_id, choice_index, body_md, explanation_md, related_article_id, related_case_id")
    .eq("problem_id", problemId)
    .order("choice_index");
  const choices = choicesRaw ?? [];

  const { data: boxRaw } = await client
    .from("problem_box_items")
    .select("box_item_id, marker, position_index, body_md, explanation_md, related_article_id, related_case_id")
    .eq("problem_id", problemId)
    .order("position_index");
  const boxes = boxRaw ?? [];

  // ① source_chunk 역추적 — per-problem 후보 시드.
  const chunkTrace = await traceSourceChunks(client, sourceChunkIds);

  // article/case 식별자 → 표시용 메타 일괄 로딩 (chunk 경로용).
  const chunkArticles = await fetchArticleMeta(client, chunkTrace.articleIds);
  const chunkCases = await fetchCaseMeta(client, chunkTrace.caseIds);

  // 누적기.
  const probArt: ArticleAccumulator = { map: new Map() };
  const probCase: CaseAccumulator = { map: new Map() };
  for (const a of chunkArticles) {
    pushArticle(probArt, { articleId: a.articleId, lawCode: a.lawCode, articleNumber: a.articleNumber, source: "chunk" });
  }
  for (const c of chunkCases) {
    pushCase(probCase, { caseId: c.caseId, caseNumber: c.caseNumber, caseTitle: c.caseTitle, source: "chunk" });
  }

  // ② 명시 정규식 — 문제 본문+해설(per-problem) + 각 선지/박스(per-segment).
  const probText = [prob.body_md ?? "", prob.explanation_md ?? ""].join("\n");
  const probRefs = extractExplicitRefs(probText, problemLawCode);
  for (const a of await resolveExplicitArticles(client, probRefs.articleNumbers)) {
    pushArticle(probArt, { ...a, source: "explicit" });
  }
  for (const c of await resolveExplicitCases(client, probRefs.caseNumbers)) {
    pushCase(probCase, { ...c, source: "explicit" });
  }

  const choiceAccs = choices.map((ch) => ({
    raw: ch,
    art: { map: new Map<string, ArticleCandidate>() } satisfies ArticleAccumulator,
    cs: { map: new Map<string, CaseCandidate>() } satisfies CaseAccumulator,
  }));
  for (const a of choiceAccs) {
    const refs = extractExplicitRefs(
      [a.raw.body_md ?? "", a.raw.explanation_md ?? ""].join("\n"),
      problemLawCode,
    );
    for (const art of await resolveExplicitArticles(client, refs.articleNumbers)) {
      pushArticle(a.art, { ...art, source: "explicit" });
    }
    for (const cs of await resolveExplicitCases(client, refs.caseNumbers)) {
      pushCase(a.cs, { ...cs, source: "explicit" });
    }
  }

  const boxAccs = boxes.map((b) => ({
    raw: b,
    art: { map: new Map<string, ArticleCandidate>() } satisfies ArticleAccumulator,
    cs: { map: new Map<string, CaseCandidate>() } satisfies CaseAccumulator,
  }));
  for (const a of boxAccs) {
    const refs = extractExplicitRefs(
      [a.raw.body_md ?? "", a.raw.explanation_md ?? ""].join("\n"),
      problemLawCode,
    );
    for (const art of await resolveExplicitArticles(client, refs.articleNumbers)) {
      pushArticle(a.art, { ...art, source: "explicit" });
    }
    for (const cs of await resolveExplicitCases(client, refs.caseNumbers)) {
      pushCase(a.cs, { ...cs, source: "explicit" });
    }
  }

  // ③ RAG — per-problem 1회만. ①+②로 article 0개 또는 case 0개일 때 보강.
  let ragSkipped: string | null = null;
  const needArticleRag = probArt.map.size === 0;
  const needCaseRag = probCase.map.size === 0;
  if (useRag && (needArticleRag || needCaseRag)) {
    const cap = await checkAiCap();
    if (cap.blocked) {
      ragSkipped = `ai_cap_${cap.reason ?? "blocked"}`;
      await recordAiUsage({
        kind: "ai_problem_link_suggest",
        model: "voyage-3",
        inputTokens: 0,
        outputTokens: 0,
        outcome: "skipped_cap",
        meta: { userId: opts.userId ?? null },
        reason: cap.reason,
      });
    } else {
      try {
        const ragText = [prob.body_md ?? "", prob.explanation_md ?? ""]
          .concat(choices.map((c) => `${c.body_md ?? ""} ${c.explanation_md ?? ""}`))
          .concat(boxes.map((b) => `${b.body_md ?? ""} ${b.explanation_md ?? ""}`))
          .join("\n")
          .slice(0, 4000);
        const result = await hybridSearch(client, ragText, {
          topK: 12,
          lawCodesOverride: problemLawCode ? [problemLawCode] : undefined,
        });
        // RAG hit → article/case source 별 후보 누적.
        const articleIds = new Set<string>();
        const caseIds = new Set<string>();
        for (const hit of result.hits) {
          if (hit.sourceType === "article") articleIds.add(hit.sourceId);
          else if (hit.sourceType === "case") caseIds.add(hit.sourceId);
        }
        const ragArticles = await fetchArticleMeta(client, [...articleIds]);
        const ragCases = await fetchCaseMeta(client, [...caseIds]);
        // hit 별 점수 — source_id 의 최고 rrf.
        const articleScore = new Map<string, number>();
        const caseScore = new Map<string, number>();
        for (const h of result.hits) {
          if (h.sourceType === "article") {
            const prev = articleScore.get(h.sourceId) ?? 0;
            if (h.rrfScore > prev) articleScore.set(h.sourceId, h.rrfScore);
          } else if (h.sourceType === "case") {
            const prev = caseScore.get(h.sourceId) ?? 0;
            if (h.rrfScore > prev) caseScore.set(h.sourceId, h.rrfScore);
          }
        }
        if (needArticleRag) {
          for (const a of ragArticles) {
            pushArticle(probArt, { ...a, source: "rag", rrfScore: articleScore.get(a.articleId) });
          }
        }
        if (needCaseRag) {
          for (const c of ragCases) {
            pushCase(probCase, { ...c, source: "rag", rrfScore: caseScore.get(c.caseId) });
          }
        }
        await recordAiUsage({
          kind: "ai_problem_link_suggest",
          model: "voyage-3",
          inputTokens: ragText.length,
          outputTokens: 0,
          outcome: "success",
          meta: { userId: opts.userId ?? null },
        });
      } catch (e) {
        ragSkipped = `rag_error_${e instanceof Error ? e.message.slice(0, 40) : "unknown"}`;
        await recordAiUsage({
          kind: "ai_problem_link_suggest",
          model: "voyage-3",
          inputTokens: 0,
          outputTokens: 0,
          outcome: "failed",
          meta: { userId: opts.userId ?? null },
          reason: ragSkipped,
        });
      }
    }
  } else if (!useRag) {
    ragSkipped = "rag_disabled";
  }

  return {
    problemId,
    perProblem: {
      articles: sortArticles([...probArt.map.values()]),
      cases: sortCases([...probCase.map.values()]),
    },
    perChoice: choiceAccs.map((a) => ({
      choiceId: a.raw.choice_id,
      choiceIndex: a.raw.choice_index,
      bodyMd: a.raw.body_md ?? "",
      explanationMd: a.raw.explanation_md,
      currentArticleId: a.raw.related_article_id,
      currentCaseId: a.raw.related_case_id,
      articles: sortArticles([...a.art.map.values()]),
      cases: sortCases([...a.cs.map.values()]),
    })),
    perBoxItem: boxAccs.map((a) => ({
      boxItemId: a.raw.box_item_id,
      marker: a.raw.marker,
      bodyMd: a.raw.body_md ?? "",
      explanationMd: a.raw.explanation_md,
      currentArticleId: a.raw.related_article_id,
      currentCaseId: a.raw.related_case_id,
      articles: sortArticles([...a.art.map.values()]),
      cases: sortCases([...a.cs.map.values()]),
    })),
    ragSkipped,
  };
}

// ── 메타 로딩 ────────────────────────────────────────────────────────────

async function fetchArticleMeta(
  client: SupabaseClient<Database>,
  articleIds: string[],
): Promise<Array<{ articleId: string; lawCode: string; articleNumber: string }>> {
  if (articleIds.length === 0) return [];
  const { data } = await client
    .from("articles")
    .select("article_id, article_number, laws:law_id(law_code)")
    .in("article_id", articleIds)
    .eq("level", "article");
  const out: Array<{ articleId: string; lawCode: string; articleNumber: string }> = [];
  for (const a of data ?? []) {
    if (!a.article_number) continue;
    out.push({
      articleId: a.article_id,
      lawCode: (a.laws as { law_code: string } | null)?.law_code ?? "",
      articleNumber: a.article_number,
    });
  }
  return out;
}

async function fetchCaseMeta(
  client: SupabaseClient<Database>,
  caseIds: string[],
): Promise<Array<{ caseId: string; caseNumber: string; caseTitle: string }>> {
  if (caseIds.length === 0) return [];
  const { data } = await client
    .from("cases")
    .select("case_id, case_number, case_title")
    .in("case_id", caseIds);
  return (data ?? []).map((c) => ({
    caseId: c.case_id,
    caseNumber: c.case_number,
    caseTitle: c.case_title ?? "",
  }));
}
