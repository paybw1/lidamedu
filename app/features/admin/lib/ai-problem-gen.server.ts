// feat §3+§4 — 1차 객관식 AI 초안 생성 + 정답 구조 1차 검증.
//
// 흐름:
//   1) 강사 입력: lawCode + (선택) primaryArticleIds[] + formatMix + count + model
//   2) 대상 article 선정·분포 배분: primaryArticleIds 없으면 lawCode 의 article level 에서
//      무작위 N개 균등 sampling. 형식 비율 (mc_short / mc_box) 적용.
//   3) 각 article 당 hybrid-search 호출 → 근거 청크 (lawCodesOverride=lawCode).
//      청크 수 < threshold → "근거 부족" 표기, 생성 skip.
//   4) Anthropic JSON 응답 (mc_short / mc_box 동일 스키마, format 분기).
//   5) 1차 정답 구조 검증 (§4):
//        mc_short: 정답 1개 / 정답 ∈ 선지 / 선지 중복 없음.
//        mc_box: ㄱㄴㄷ… 각 ox_truth 존재 / 정답 선지 = 실제 참 보기 조합.
//      실패는 reject 가 아니라 gen_range.structureWarning 에 메시지 기록 (강사 판단).
//   6) 중복 의심 — 기존 풀에서 body_md 처음 80자 substring 매칭 + same article 우선.
//   7) DB 저장: problems(review_status='draft', origin='ai_draft', generated_by/at,
//      source_chunk_ids, gen_range{ structureWarning, duplicateSuspectedOf })
//      + problem_choices + problem_box_items.
//   8) 비용/토큰 — usage-tracker recordUsage. global cap 체크.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "database.types";

import { AI_QNA_MODEL } from "~/features/ai-qna/lib/constants";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import {
  capBlockedMessage,
  checkGlobalCap,
  recordUsage,
} from "~/features/ai-qna/lib/usage-tracker.server";
import {
  CITATION_PROMPT_RULE,
  scrubCitations,
} from "~/features/cases/lib/citation-guard";
import { loadKnownCaseNumbers } from "~/features/cases/lib/known-case-numbers.server";
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

/**
 * 출제 지식 유형 — 사용자 요청의 2분할(판례 : 조문/이론).
 * precedent = 판례 법리(case-seeded), statute_theory = 조문·이론(article-seeded).
 * (OX 진단의 3분할 statute/precedent/theory 와 달리 조문+이론을 한 묶음으로 본다.)
 */
export type KnowledgeType = "precedent" | "statute_theory";

export interface GenerateOptions {
  lawCode: LawSubjectSlug;
  /** 비어 있으면 lawCode 의 article level 에서 무작위 sampling. */
  primaryArticleIds?: string[];
  /** mc_short / mc_box 합산 = total. */
  formatMix: { mc_short: number; mc_box: number };
  /**
   * 0~100. 판례(precedent) 문항 비율. 나머지는 조문/이론(statute_theory). default 50.
   * 실제 1차 시험 출제 비중(판례:조문이론 ≈ 50:50)을 기본값으로.
   */
  precedentRatio?: number;
  /** 생성 모델 — default sonnet 4.6 (Q&A 와 별개 설정). */
  model?: string;
  /** 한 article 당 RAG top-K. default 8. */
  topK?: number;
  /** 근거 부족 임계 — hits < threshold → skip. default 2. */
  minChunkThreshold?: number;
}

export interface GenerateReport {
  totalRequested: number;
  totalGenerated: number;
  totalSkippedNoEvidence: number;
  /** 판례 슬롯인데 과목에 색인된 판례가 없어 생성 불가한 수. */
  totalSkippedNoCases: number;
  totalStructureWarnings: number;
  totalDuplicateSuspected: number;
  /** 근거 없는 사건번호가 섞여 손댄 문항 수(CLAUDE.md #12). */
  totalCitationWarnings: number;
  /** 지식 유형별 실제 생성 수. */
  byKnowledge: { precedent: number; statute_theory: number };
  generatedProblemIds: string[];
  perTargetErrors: Array<{
    targetId: string;
    targetKind: "article" | "case";
    reason: string;
  }>;
  tokenUsage: { input: number; output: number };
  costUsd: number;
}

const PROBLEM_ITEM_SCHEMA = z.object({
  format: z.enum(["mc_short", "mc_box"]),
  body_md: z.string().min(10),
  explanation_md: z.string().optional().default(""),
  choices: z.array(
    z.object({
      choice_index: z.number().int().min(1).max(10),
      body_md: z.string().min(1),
      is_correct: z.boolean(),
      explanation_md: z.string().optional().default(""),
    }),
  ).min(2).max(10),
  box_items: z.array(
    z.object({
      position_index: z.number().int().min(1).max(10),
      marker: z.string().min(1).max(4),
      body_md: z.string().min(1),
      ox_truth: z.enum(["true", "false", "unknown"]),
      explanation_md: z.string().optional().default(""),
    }),
  ).default([]),
});
type GeneratedProblem = z.infer<typeof PROBLEM_ITEM_SCHEMA>;

const RESPONSE_SCHEMA = z.object({
  problem: PROBLEM_ITEM_SCHEMA,
});

const SYSTEM_PROMPT = [
  "당신은 대한민국 변리사 1차 객관식 문제 출제 전문가입니다.",
  "주어진 RAG 근거 청크만 사용해 객관식 문제 1개를 출제하세요.",
  "",
  "다음 규칙을 반드시 지킵니다:",
  "1. **근거 안에서만 출제** — 청크 밖 사실·조문·판례·연도·인명은 만들지 마세요.",
  "2. **출처 정확성** — 정답·오답 사유가 청크 텍스트로 직접 검증 가능해야 합니다.",
  "3. **단답형(mc_short)** — 정확히 5개 선지. 정답 정확히 1개. 매력적인 오답 4개. 각 선지의 정오 사유를 explanation_md 에.",
  "4. **박스형(mc_box)** — 보기(box_items) ㄱㄴㄷㄹㅁ 4~5개 + 각 보기의 ox_truth(true/false). 선지는 '참인 보기 조합'(예: ① ㄱ,ㄷ). 정답 선지 = 실제 참 보기들의 조합과 정확히 일치.",
  "5. **본문 톤** — 변리사 시험 톤, 법령 용어 정확, 간결.",
  "6. **출제 유형** — 사용자 프롬프트의 [출제 유형](판례 / 조문·이론)에 맞춰 출제하세요. 판례는 판시사항·결론·법리를, 조문·이론은 요건·효과·해석을 검증합니다.",
  "7. **응답 형식** — 아래 JSON 스키마 그대로. 추가 설명 없이 JSON 만:",
  CITATION_PROMPT_RULE,
  "",
  '{ "problem": {',
  '  "format": "mc_short" | "mc_box",',
  '  "body_md": "문제 본문 (markdown)",',
  '  "explanation_md": "종합 해설",',
  '  "choices": [ { "choice_index": 1, "body_md": "선지 내용", "is_correct": true|false, "explanation_md": "정오 사유" }, ... ],',
  '  "box_items": [ { "position_index": 1, "marker": "ㄱ", "body_md": "보기 내용", "ox_truth": "true"|"false", "explanation_md": "근거" }, ... ] (mc_box 일 때만, 4~5개)',
  "} }",
].join("\n");

interface ContextChunkRef {
  chunkId: string;
  sourceType: string;
  headingPath: string | null;
  bodyText: string;
}

function buildUserPrompt(
  format: "mc_short" | "mc_box",
  knowledge: KnowledgeType,
  contextChunks: ContextChunkRef[],
  primaryLabel: string | null,
): string {
  const lines: string[] = [];
  lines.push(`형식: ${format === "mc_short" ? "단답형(mc_short, 5지선다)" : "박스형(mc_box, ㄱㄴㄷㄹㅁ + 조합 선지)"}`);
  // 출제 유형 — 판례 법리 vs 조문·이론. RAG 근거의 성격과 일치시킨다.
  if (knowledge === "precedent") {
    lines.push("[출제 유형: 판례]");
    lines.push("- 제시된 판례 근거의 판시사항·판결요지·결론(법리)만 사용해 출제하세요.");
    lines.push("- 본문에 사건의 쟁점을 간결히 제시하고, 선지로 법리의 정오를 판단하게 하세요.");
    lines.push("- 근거 밖 사건·연도·인명·법리는 절대 만들지 마세요.");
    if (primaryLabel) lines.push(`대상 판례: ${primaryLabel}`);
  } else {
    lines.push("[출제 유형: 조문·이론]");
    lines.push("- 제시된 조문·이론 근거의 요건·효과·해석으로 정오가 직접 검증되게 하세요.");
    if (primaryLabel) lines.push(`주요 조문: ${primaryLabel}`);
  }
  lines.push("");
  lines.push("[근거 청크]");
  for (let i = 0; i < contextChunks.length; i++) {
    const c = contextChunks[i];
    lines.push(`[${i + 1}] [${c.sourceType}] ${c.headingPath ?? "(no heading)"}`);
    lines.push(c.bodyText.slice(0, 1200));
    lines.push("");
  }
  lines.push("위 근거만 사용해 JSON 으로 응답하세요.");
  return lines.join("\n");
}

// 1차 정답 구조 검증 (§4). 실패 시 사유 메시지 반환, 통과 시 null.
export function validateProblemStructure(p: GeneratedProblem): string | null {
  if (p.format === "mc_short") {
    if (p.choices.length !== 5) {
      return `단답형은 정확히 5개 선지 필요 (현재 ${p.choices.length})`;
    }
    const correctCount = p.choices.filter((c) => c.is_correct).length;
    if (correctCount !== 1) {
      return `단답형 정답은 정확히 1개 (현재 ${correctCount})`;
    }
    const bodies = new Set(p.choices.map((c) => c.body_md.trim()));
    if (bodies.size !== p.choices.length) {
      return "선지 본문 중복 발견";
    }
    return null;
  }
  // mc_box
  if (p.box_items.length < 3 || p.box_items.length > 6) {
    return `박스형은 보기 3~6개 필요 (현재 ${p.box_items.length})`;
  }
  if (p.choices.length < 2) {
    return "박스형 선지가 부족합니다 (최소 2)";
  }
  // 각 보기에 ox_truth 있어야 한다 (zod 강제 — 여기선 검증 only).
  const truthByMarker = new Map<string, "true" | "false" | "unknown">();
  for (const b of p.box_items) truthByMarker.set(b.marker, b.ox_truth);
  if ([...truthByMarker.values()].some((v) => v === "unknown")) {
    return "박스형 보기 중 ox_truth 가 unknown 인 항목 있음";
  }
  // 정답 선지 = 참 보기 조합. 선지 body_md 에 ㄱ,ㄷ 같은 marker 가 등장한다고 가정.
  const trueMarkers = new Set(
    p.box_items.filter((b) => b.ox_truth === "true").map((b) => b.marker),
  );
  const correctChoices = p.choices.filter((c) => c.is_correct);
  if (correctChoices.length !== 1) {
    return `박스형 정답 선지는 정확히 1개 (현재 ${correctChoices.length})`;
  }
  const correctBody = correctChoices[0].body_md;
  // marker 추출 — body_md 안에서 "ㄱ", "ㄴ" 등 보기 marker 가 등장하는지.
  const matchedMarkers = new Set<string>();
  for (const b of p.box_items) {
    if (correctBody.includes(b.marker)) matchedMarkers.add(b.marker);
  }
  // 매칭된 marker set 이 trueMarkers set 과 정확히 일치해야.
  if (matchedMarkers.size !== trueMarkers.size) {
    return `정답 선지(${correctBody}) 의 보기 조합이 실제 참 보기(${[...trueMarkers].join(",")}) 와 불일치`;
  }
  for (const m of trueMarkers) {
    if (!matchedMarkers.has(m)) {
      return `정답 선지 누락 보기: ${m}`;
    }
  }
  return null;
}

/**
 * 생성 문항 전체(본문·해설·선지·보기)의 인용 사건번호를 스크럽한다 — 제자리 수정.
 * 괄호 인용은 지우고, 문장에 박혀 지우면 문장이 깨지는 것은 남겨 반환한다(사람이 고침).
 */
function scrubProblemCitations(
  p: GeneratedProblem,
  allowed: ReadonlySet<string>,
  sourceText: string,
): string[] {
  const leftover = new Set<string>();
  const fix = (v: string): string => {
    const res = scrubCitations(v, allowed, sourceText);
    for (const n of res.leftover) leftover.add(n);
    return res.text;
  };
  p.body_md = fix(p.body_md);
  p.explanation_md = fix(p.explanation_md);
  for (const c of p.choices) {
    c.body_md = fix(c.body_md);
    c.explanation_md = fix(c.explanation_md);
  }
  for (const b of p.box_items) {
    b.body_md = fix(b.body_md);
    b.explanation_md = fix(b.explanation_md);
  }
  return [...leftover];
}

// 중복 의심 — 기존 풀에서 body_md substring 매칭 + same lawCode 우선.
async function detectDuplicateSuspected(
  client: SupabaseClient<Database>,
  lawId: string | null,
  bodyMd: string,
): Promise<string[]> {
  const snippet = bodyMd.slice(0, 60).trim();
  if (snippet.length < 20) return [];
  const safe = snippet.replace(/[%_]/g, (m) => `\\${m}`);
  let q = client
    .from("problems")
    .select("problem_id")
    .ilike("body_md", `%${safe}%`)
    .is("deleted_at", null)
    .limit(3);
  if (lawId) q = q.eq("law_id", lawId);
  const { data } = await q;
  return (data ?? []).map((r) => r.problem_id);
}

// 모델 단가 (1M 토큰 USD). pricing.ts 와 동기화.
const MODEL_PRICE: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-6-20251114": { input: 3, output: 15 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
};

function estimateCost(model: string, input: number, output: number): number {
  const p = MODEL_PRICE[model] ?? MODEL_PRICE["claude-sonnet-4-6"];
  return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
}

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

interface ArticleTarget {
  articleId: string;
  displayLabel: string | null;
  articleNumber: string | null;
}

interface CaseTarget {
  caseId: string;
  caseNumber: string;
  caseTitle: string;
  summaryTitle: string | null;
  primaryNodeId: string | null;
  primaryArticleId: string | null;
}

async function resolveLawId(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
): Promise<string | null> {
  const { data } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  return data?.law_id ?? null;
}

// 조문/이론 대상 — primaryArticleIds 있으면 그 안에서, 없으면 과목 전체 article level 에서
// 무작위 sampling. count 만큼 (pool 보다 많이 요청하면 라운드 배분으로 반복).
async function pickArticleTargets(
  client: SupabaseClient<Database>,
  lawId: string,
  primaryArticleIds: string[] | undefined,
  count: number,
): Promise<ArticleTarget[]> {
  if (count <= 0) return [];

  let pool: ArticleTarget[];
  if (primaryArticleIds && primaryArticleIds.length > 0) {
    const { data } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .in("article_id", primaryArticleIds)
      .eq("level", "article")
      .is("deleted_at", null);
    pool = (data ?? []).map((r) => ({
      articleId: r.article_id,
      displayLabel: r.display_label,
      articleNumber: r.article_number,
    }));
  } else {
    const { data } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .eq("law_id", lawId)
      .eq("level", "article")
      .is("deleted_at", null)
      .limit(500);
    pool = (data ?? [])
      .map((r) => ({
        articleId: r.article_id,
        displayLabel: r.display_label,
        articleNumber: r.article_number,
      }))
      .sort(() => Math.random() - 0.5);
  }
  if (pool.length === 0) return [];
  const targets: ArticleTarget[] = [];
  for (let i = 0; i < count; i++) targets.push(pool[i % pool.length]);
  return targets;
}

// 판례 대상 — 과목(subject_laws)에 색인된 판례에서 무작위 sampling. 없으면 빈 배열
// (호출부가 '판례 미색인 과목' skip 처리). 현재 판례 색인은 특허법만 존재.
async function pickCaseTargets(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  count: number,
): Promise<CaseTarget[]> {
  if (count <= 0) return [];
  const { data } = await client
    .from("cases")
    .select(
      "case_id, case_number, case_title, summary_title, primary_node_id, primary_article_id",
    )
    .contains("subject_laws", [lawCode])
    .is("deleted_at", null)
    .limit(500);
  const pool: CaseTarget[] = (data ?? [])
    .map((r) => ({
      caseId: r.case_id,
      caseNumber: r.case_number,
      caseTitle: r.case_title,
      summaryTitle: r.summary_title,
      primaryNodeId: r.primary_node_id,
      primaryArticleId: r.primary_article_id,
    }))
    .sort(() => Math.random() - 0.5);
  if (pool.length === 0) return [];
  const targets: CaseTarget[] = [];
  for (let i = 0; i < count; i++) targets.push(pool[i % pool.length]);
  return targets;
}

interface Slot {
  format: "mc_short" | "mc_box";
  knowledge: KnowledgeType;
}

// N개 슬롯에 (형식 × 지식유형) 배정. 형식은 formatMix 개수대로, 지식유형은 precedentCount
// 를 균등 분산(Bresenham — 정확히 precedentCount 개가 고르게 흩어진다). 마지막에 셔플해
// 형식↔지식유형이 위치로 묶이지 않게(예: 박스형이 전부 판례로 쏠리는 것 방지).
function planSlots(
  formatMix: { mc_short: number; mc_box: number },
  precedentCount: number,
): Slot[] {
  const total = formatMix.mc_short + formatMix.mc_box;
  if (total === 0) return [];
  const formats: Array<"mc_short" | "mc_box"> = [];
  for (let i = 0; i < formatMix.mc_short; i++) formats.push("mc_short");
  for (let i = 0; i < formatMix.mc_box; i++) formats.push("mc_box");
  const slots: Slot[] = [];
  for (let i = 0; i < total; i++) {
    const before = Math.floor((i * precedentCount) / total);
    const after = Math.floor(((i + 1) * precedentCount) / total);
    slots.push({
      format: formats[i] ?? "mc_short",
      knowledge: after > before ? "precedent" : "statute_theory",
    });
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots;
}

export async function generateAiDraftProblems(
  client: SupabaseClient<Database>,
  adminClient: SupabaseClient<Database>,
  userId: string,
  opts: GenerateOptions,
): Promise<GenerateReport> {
  const model = opts.model ?? AI_QNA_MODEL;
  const topK = opts.topK ?? 8;
  const minChunkThreshold = opts.minChunkThreshold ?? 2;
  const totalCount = opts.formatMix.mc_short + opts.formatMix.mc_box;
  const precedentRatio = Math.min(100, Math.max(0, opts.precedentRatio ?? 50));
  const precedentCount = Math.round((totalCount * precedentRatio) / 100);
  const statuteCount = totalCount - precedentCount;

  const report: GenerateReport = {
    totalRequested: totalCount,
    totalGenerated: 0,
    totalSkippedNoEvidence: 0,
    totalSkippedNoCases: 0,
    totalStructureWarnings: 0,
    totalDuplicateSuspected: 0,
    totalCitationWarnings: 0,
    byKnowledge: { precedent: 0, statute_theory: 0 },
    generatedProblemIds: [],
    perTargetErrors: [],
    tokenUsage: { input: 0, output: 0 },
    costUsd: 0,
  };

  if (totalCount === 0) return report;

  // 사전 cap 체크.
  const capBefore = await checkGlobalCap(adminClient);
  if (capBefore.blocked) {
    throw new Error(`[GLOBAL CAP BLOCKED] ${capBlockedMessage(capBefore)}`);
  }

  const lawId = await resolveLawId(client, opts.lawCode);
  if (!lawId) return report;

  // ★★생성 단계 차단(CLAUDE.md #12) — 근거 없는 사건번호를 못 쓰게 한다.
  //   허용 = 우리 DB 에 있는 번호 + 이 문항이 딛고 선 RAG 근거 청크에 적힌 번호.
  //   수천 행이라 루프 밖에서 한 번만 읽는다.
  const knownCaseNumbers = await loadKnownCaseNumbers(client);

  // 슬롯 계획(형식 × 지식유형) + 유형별 대상 풀.
  const slots = planSlots(opts.formatMix, precedentCount);
  const articleTargets = await pickArticleTargets(
    client,
    lawId,
    opts.primaryArticleIds,
    statuteCount,
  );
  const caseTargets = await pickCaseTargets(client, opts.lawCode, precedentCount);

  const anthropic = getAnthropic();
  let aCursor = 0;
  let cCursor = 0;

  for (const slot of slots) {
    const targetKind: "article" | "case" =
      slot.knowledge === "precedent" ? "case" : "article";

    // 매 슬롯마다 cap 재확인.
    const cap = await checkGlobalCap(adminClient);
    if (cap.blocked) {
      report.perTargetErrors.push({
        targetId: "-",
        targetKind,
        reason: capBlockedMessage(cap),
      });
      break;
    }

    // 슬롯별 대상·질의 결정. 판례 = case-seeded(case_number 직격 + graph 확장),
    // 조문/이론 = article-seeded(기존 흐름).
    let queryText = "";
    let minChunk = minChunkThreshold;
    let primaryLabel: string | null = null;
    let article: ArticleTarget | null = null;
    let caseT: CaseTarget | null = null;

    if (slot.knowledge === "precedent") {
      caseT = caseTargets[cCursor++] ?? null;
      if (!caseT) {
        // 과목에 색인된 판례가 없음 → 판례 문항 생성 불가(현재 특허법만 색인).
        report.totalSkippedNoCases += 1;
        report.perTargetErrors.push({
          targetId: "-",
          targetKind: "case",
          reason: "과목에 색인된 판례가 없어 판례 문항을 생성할 수 없습니다",
        });
        continue;
      }
      // case_number 를 질의에 포함 → structured 경로가 해당 판례 청크를 직격 + graph 로
      //   관련 조문 확장. 판례 1청크(판시사항)만으로도 출제 충분 → 임계 1.
      queryText = `${caseT.caseNumber} ${caseT.caseTitle}`;
      minChunk = 1;
      primaryLabel = caseT.summaryTitle ?? caseT.caseTitle;
    } else {
      article = articleTargets[aCursor++] ?? null;
      if (!article) {
        report.totalSkippedNoEvidence += 1;
        report.perTargetErrors.push({
          targetId: "-",
          targetKind: "article",
          reason: "조문 대상이 없습니다",
        });
        continue;
      }
      queryText = article.displayLabel ?? article.articleNumber ?? "";
      primaryLabel = article.displayLabel;
    }

    const targetId = caseT?.caseId ?? article?.articleId ?? "-";

    // RAG 근거 검색.
    let hits: ContextChunkRef[] = [];
    try {
      const search = await hybridSearch(client, queryText, {
        topK,
        lawCodesOverride: [opts.lawCode],
      });
      hits = search.hits.map((h) => ({
        chunkId: h.chunkId,
        sourceType: h.sourceType,
        headingPath: h.headingPath,
        bodyText: h.bodyText,
      }));
    } catch (e) {
      report.perTargetErrors.push({
        targetId,
        targetKind,
        reason: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (hits.length < minChunk) {
      report.totalSkippedNoEvidence += 1;
      report.perTargetErrors.push({
        targetId,
        targetKind,
        reason: `근거 부족 (hits=${hits.length})`,
      });
      continue;
    }

    // Anthropic JSON 호출.
    let parsedItem: GeneratedProblem | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const userPrompt = buildUserPrompt(
        slot.format,
        slot.knowledge,
        hits,
        primaryLabel,
      );
      const resp = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      inputTokens = resp.usage?.input_tokens ?? 0;
      outputTokens = resp.usage?.output_tokens ?? 0;
      const textBlock = resp.content.find((b) => b.type === "text");
      const rawText = textBlock && "text" in textBlock ? textBlock.text : "";
      // JSON 추출 (코드 블록 또는 raw).
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found in response");
      const parsed = RESPONSE_SCHEMA.safeParse(JSON.parse(jsonMatch[0]));
      if (!parsed.success) {
        throw new Error(
          `Zod parse fail: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        );
      }
      parsedItem = parsed.data.problem;
    } catch (e) {
      report.perTargetErrors.push({
        targetId,
        targetKind,
        reason: e instanceof Error ? e.message : String(e),
      });
      // 토큰 사용량은 일부 발생했을 수 있어 누적.
      report.tokenUsage.input += inputTokens;
      report.tokenUsage.output += outputTokens;
      if (inputTokens > 0 || outputTokens > 0) {
        await recordUsage(adminClient, model, inputTokens, outputTokens);
      }
      continue;
    }

    report.tokenUsage.input += inputTokens;
    report.tokenUsage.output += outputTokens;
    report.costUsd += estimateCost(model, inputTokens, outputTokens);
    await recordUsage(adminClient, model, inputTokens, outputTokens);

    // ★인용 스크럽 — 근거 청크에 없는 사건번호는 걷어낸다. 법리가 맞아도 번호가 틀리면
    //   잘못된 정보이고, 사후 감사로는 "실재하지 않음" 을 확정할 수 없다.
    const citationSource = [
      primaryLabel ?? "",
      ...hits.map((h) => h.bodyText),
    ].join("\n");
    const citationLeftover = scrubProblemCitations(
      parsedItem,
      knownCaseNumbers,
      citationSource,
    );
    if (citationLeftover.length > 0) report.totalCitationWarnings += 1;

    // §4 1차 정답 구조 검증 — 실패도 저장 (강사 판단).
    const structureWarning = validateProblemStructure(parsedItem);
    if (structureWarning) report.totalStructureWarnings += 1;

    // 중복 의심 (lawCode 안).
    const duplicates = await detectDuplicateSuspected(
      client,
      lawId,
      parsedItem.body_md,
    );
    if (duplicates.length > 0) report.totalDuplicateSuspected += 1;

    // DB 저장 — problems + choices + box_items.
    const sourceChunkIds = hits.map((h) => h.chunkId);
    const genRange: Record<string, unknown> = {
      lawCode: opts.lawCode,
      requestedFormat: slot.format,
      knowledgeType: slot.knowledge,
      structureWarning: structureWarning ?? null,
      // 자동으로 못 지운 근거 없는 인용 — 강사가 손봐야 한다.
      citationWarning: citationLeftover.length > 0 ? citationLeftover : null,
      duplicateSuspectedOf: duplicates,
      modelUsed: model,
    };
    if (caseT) {
      genRange.primaryCaseId = caseT.caseId;
      genRange.primaryCaseNumber = caseT.caseNumber;
    }
    if (article) {
      genRange.primaryArticleId = article.articleId;
    }

    const { data: prob, error: pErr } = await client
      .from("problems")
      .insert({
        law_id: lawId,
        exam_round: "first",
        subject_type: "law",
        origin: "ai_draft",
        format: parsedItem.format,
        body_md: parsedItem.body_md,
        explanation_md: parsedItem.explanation_md || null,
        // 판례 문항은 조문이 없을 수 있어 case 의 노드를 단원 앵커로 사용.
        primary_article_id: caseT
          ? caseT.primaryArticleId
          : (article?.articleId ?? null),
        primary_node_id: caseT ? caseT.primaryNodeId : null,
        created_by: userId,
        review_status: "draft",
        generated_by: model,
        generated_at: new Date().toISOString(),
        source_chunk_ids: sourceChunkIds,
        gen_range: genRange as unknown as Database["public"]["Tables"]["problems"]["Insert"]["gen_range"],
      })
      .select("problem_id")
      .single();
    if (pErr || !prob) {
      report.perTargetErrors.push({
        targetId,
        targetKind,
        reason: pErr?.message ?? "insert failed",
      });
      continue;
    }

    // 판례 출처 링크 — relations 그래프(problem ↔ case). cited.
    if (caseT) {
      const { error: lErr } = await client.from("problem_case_links").insert({
        problem_id: prob.problem_id,
        case_id: caseT.caseId,
        relation_type: "cited",
        created_by: userId,
      });
      if (lErr) {
        report.perTargetErrors.push({
          targetId,
          targetKind,
          reason: `case link fail: ${lErr.message}`,
        });
      }
    }

    // 선지.
    if (parsedItem.choices.length > 0) {
      const choiceRows = parsedItem.choices.map((c) => ({
        problem_id: prob.problem_id,
        choice_index: c.choice_index,
        body_md: c.body_md,
        is_correct: c.is_correct,
        explanation_md: c.explanation_md || null,
      }));
      const { error: cErr } = await client
        .from("problem_choices")
        .insert(choiceRows);
      if (cErr) {
        report.perTargetErrors.push({
          targetId,
          targetKind,
          reason: `choice insert fail: ${cErr.message}`,
        });
      }
    }

    // 박스 (mc_box). DB ox_truth enum 은 "O" | "X" — true→O, false→X 매핑.
    if (parsedItem.format === "mc_box" && parsedItem.box_items.length > 0) {
      const boxRows = parsedItem.box_items.map((b) => ({
        problem_id: prob.problem_id,
        position_index: b.position_index,
        marker: b.marker,
        body_md: b.body_md,
        explanation_md: b.explanation_md || null,
        ox_truth:
          b.ox_truth === "true"
            ? ("O" as const)
            : b.ox_truth === "false"
              ? ("X" as const)
              : null,
      }));
      const { error: bErr } = await client
        .from("problem_box_items")
        .insert(boxRows);
      if (bErr) {
        report.perTargetErrors.push({
          targetId,
          targetKind,
          reason: `box insert fail: ${bErr.message}`,
        });
      }
    }

    report.totalGenerated += 1;
    report.byKnowledge[slot.knowledge] += 1;
    report.generatedProblemIds.push(prob.problem_id);
  }

  return report;
}
