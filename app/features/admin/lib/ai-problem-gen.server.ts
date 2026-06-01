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
import type { LawSubjectSlug } from "~/features/subjects/lib/subjects";

export interface GenerateOptions {
  lawCode: LawSubjectSlug;
  /** 비어 있으면 lawCode 의 article level 에서 무작위 sampling. */
  primaryArticleIds?: string[];
  /** mc_short / mc_box 합산 = total. */
  formatMix: { mc_short: number; mc_box: number };
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
  totalStructureWarnings: number;
  totalDuplicateSuspected: number;
  generatedProblemIds: string[];
  perArticleErrors: Array<{ articleId: string; reason: string }>;
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
  "6. **응답 형식** — 아래 JSON 스키마 그대로. 추가 설명 없이 JSON 만:",
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
  contextChunks: ContextChunkRef[],
  primaryArticleLabel: string | null,
): string {
  const lines: string[] = [];
  lines.push(`형식: ${format === "mc_short" ? "단답형(mc_short, 5지선다)" : "박스형(mc_box, ㄱㄴㄷㄹㅁ + 조합 선지)"}`);
  if (primaryArticleLabel) lines.push(`주요 조문: ${primaryArticleLabel}`);
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

async function pickArticleTargets(
  client: SupabaseClient<Database>,
  lawCode: LawSubjectSlug,
  primaryArticleIds: string[] | undefined,
  totalCount: number,
): Promise<{ targets: ArticleTarget[]; lawId: string | null }> {
  const { data: law } = await client
    .from("laws")
    .select("law_id")
    .eq("law_code", lawCode)
    .maybeSingle();
  if (!law) return { targets: [], lawId: null };

  if (primaryArticleIds && primaryArticleIds.length > 0) {
    const { data } = await client
      .from("articles")
      .select("article_id, display_label, article_number")
      .in("article_id", primaryArticleIds)
      .eq("level", "article")
      .is("deleted_at", null);
    const list = (data ?? []).map((r) => ({
      articleId: r.article_id,
      displayLabel: r.display_label,
      articleNumber: r.article_number,
    }));
    // totalCount 만큼 라운드 배분 — 같은 article 이 여러 번 들어갈 수 있다.
    const targets: ArticleTarget[] = [];
    for (let i = 0; i < totalCount && list.length > 0; i++) {
      targets.push(list[i % list.length]);
    }
    return { targets, lawId: law.law_id };
  }

  // primaryArticleIds 없으면 lawCode 전체 article level 에서 무작위 sampling.
  const { data } = await client
    .from("articles")
    .select("article_id, display_label, article_number")
    .eq("law_id", law.law_id)
    .eq("level", "article")
    .is("deleted_at", null)
    .limit(500);
  const pool = (data ?? []).map((r) => ({
    articleId: r.article_id,
    displayLabel: r.display_label,
    articleNumber: r.article_number,
  }));
  if (pool.length === 0) return { targets: [], lawId: law.law_id };
  const targets: ArticleTarget[] = [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  for (let i = 0; i < totalCount; i++) {
    targets.push(shuffled[i % shuffled.length]);
  }
  return { targets, lawId: law.law_id };
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

  const report: GenerateReport = {
    totalRequested: totalCount,
    totalGenerated: 0,
    totalSkippedNoEvidence: 0,
    totalStructureWarnings: 0,
    totalDuplicateSuspected: 0,
    generatedProblemIds: [],
    perArticleErrors: [],
    tokenUsage: { input: 0, output: 0 },
    costUsd: 0,
  };

  // 사전 cap 체크.
  const capBefore = await checkGlobalCap(adminClient);
  if (capBefore.blocked) {
    throw new Error(`[GLOBAL CAP BLOCKED] ${capBlockedMessage(capBefore)}`);
  }

  const { targets, lawId } = await pickArticleTargets(
    client,
    opts.lawCode,
    opts.primaryArticleIds,
    totalCount,
  );
  if (targets.length === 0) {
    return report;
  }

  // 형식 분배 — 앞쪽 mc_short, 뒤쪽 mc_box.
  const formats: Array<"mc_short" | "mc_box"> = [];
  for (let i = 0; i < opts.formatMix.mc_short; i++) formats.push("mc_short");
  for (let i = 0; i < opts.formatMix.mc_box; i++) formats.push("mc_box");

  const anthropic = getAnthropic();

  for (let idx = 0; idx < targets.length; idx++) {
    const article = targets[idx];
    const format = formats[idx] ?? "mc_short";

    // 매 article 마다 cap 재확인.
    const cap = await checkGlobalCap(adminClient);
    if (cap.blocked) {
      report.perArticleErrors.push({
        articleId: article.articleId,
        reason: capBlockedMessage(cap),
      });
      break;
    }

    // RAG 근거 검색 — article.displayLabel 을 질문처럼 사용.
    const queryText = article.displayLabel ?? article.articleNumber ?? "";
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
      report.perArticleErrors.push({
        articleId: article.articleId,
        reason: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    if (hits.length < minChunkThreshold) {
      report.totalSkippedNoEvidence += 1;
      report.perArticleErrors.push({
        articleId: article.articleId,
        reason: `근거 부족 (hits=${hits.length})`,
      });
      continue;
    }

    // Anthropic JSON 호출.
    let parsedItem: GeneratedProblem | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const userPrompt = buildUserPrompt(format, hits, article.displayLabel);
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
      report.perArticleErrors.push({
        articleId: article.articleId,
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
      requestedFormat: format,
      primaryArticleId: article.articleId,
      structureWarning: structureWarning ?? null,
      duplicateSuspectedOf: duplicates,
      modelUsed: model,
    };

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
        primary_article_id: article.articleId,
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
      report.perArticleErrors.push({
        articleId: article.articleId,
        reason: pErr?.message ?? "insert failed",
      });
      continue;
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
        report.perArticleErrors.push({
          articleId: article.articleId,
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
        report.perArticleErrors.push({
          articleId: article.articleId,
          reason: `box insert fail: ${bErr.message}`,
        });
      }
    }

    report.totalGenerated += 1;
    report.generatedProblemIds.push(prob.problem_id);
  }

  return report;
}
