// 통합 Q&A — AI 즉답 배선(Phase 2).
//
// 질문 생성 시 (1) 등급별 토글 + (2) 일일 쿼터 + (3) 글로벌 비용 캡을 통과하면
// Haiku 로 RAG 답변을 생성해 qna_messages(role='ai') 에 저장하고 스레드를 ai_answered 로 전환한다.
// 토글 OFF·쿼터/캡 초과·도메인 게이트 차단·모델 자체 거절이면 AI 메시지를 만들지 않고
// 스레드를 open(강사 대기) 으로 둔다 — 매끄러운 폴백.
//
// RAG 코어(hybridSearch·answerQuestion·게이트·사용량 기록)는 기존 ai-qna 인프라를 그대로
// 재사용하고, 모델만 Haiku(QNA_INSTANT_MODEL)로 바꾼다. 생성은 응답 반환 후 background
// (runAfterResponse) 에서 돌리므로 본 모듈은 service-role adminClient 로 동작한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "database.types";

import { getAppSetting, setAppSetting } from "~/core/lib/app-settings.server";
import { classifyRefusal } from "~/features/ai-qna/conversations.server";
import {
  answerQuestion,
  type AnswerTurn,
} from "~/features/ai-qna/lib/answer.server";
import type { Citation } from "~/features/ai-qna/lib/citations";
import {
  gateModeFromEnv,
  postSearchGate,
  preSearchGate,
} from "~/features/ai-qna/lib/domain-gate.server";
import { hybridSearch } from "~/features/ai-qna/lib/hybrid-search.server";
import {
  checkGlobalCap,
  recordUsage,
} from "~/features/ai-qna/lib/usage-tracker.server";
import {
  getAiQuotas,
  getQuotaState,
  getUserAiTier,
  type AiTier,
} from "~/features/ai-qna/settings.server";

/**
 * 통합 Q&A 즉답 모델 — Haiku 4.5(저렴). 강사 확인이 뒤따르므로 1차 즉답은 Haiku 로 충분.
 * 품질 미흡 시 이 상수만 상향. (구 /ai 챗은 AI_QNA_MODEL=Sonnet 유지)
 */
export const QNA_INSTANT_MODEL = "claude-haiku-4-5" as const;

// ── 등급별 즉답 토글 ───────────────────────────────────────────────────────

export const QNA_AI_INSTANT_KEY = "qna_ai_instant";

export interface QnaAiInstantToggle {
  free: boolean;
  tier1: boolean;
}

/** 초기 기본 — tier1(staff·구독자) 만 ON, free 는 품질 확인 후 개방. */
const DEFAULT_INSTANT: QnaAiInstantToggle = { free: false, tier1: true };

/**
 * 등급별 'AI 즉답' 활성 토글(app_settings.qna_ai_instant). 운영자가 SQL/UI 로 조정.
 * 미설정·비정상 값은 DEFAULT_INSTANT 로 보충.
 */
export async function getQnaAiInstantToggle(
  client: SupabaseClient<Database>,
): Promise<QnaAiInstantToggle> {
  const raw = await getAppSetting(client, QNA_AI_INSTANT_KEY);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_INSTANT };
  }
  const r = raw as Record<string, unknown>;
  return {
    free: r.free === true, // 명시적 true 일 때만 ON
    tier1: r.tier1 !== false, // 명시적 false 일 때만 OFF(기본 ON)
  };
}

/** 등급별 즉답 토글 저장(운영자). RLS 로 staff 만 통과. */
export async function setQnaAiInstantToggle(
  client: SupabaseClient<Database>,
  toggle: QnaAiInstantToggle,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return setAppSetting(
    client,
    QNA_AI_INSTANT_KEY,
    { free: toggle.free, tier1: toggle.tier1 } as unknown as Parameters<
      typeof setAppSetting
    >[2],
    userId,
  );
}

// ── 즉답 여부 결정 ─────────────────────────────────────────────────────────

export type InstantSkipReason = "instant_off" | "quota" | "cap";

export interface InstantDecision {
  ok: boolean;
  tier: AiTier;
  reason?: InstantSkipReason;
}

/**
 * 이 사용자의 질문에 AI 가 즉답할지 결정. 세 관문을 순서대로 통과해야 한다.
 *   (1) 등급 토글 ON  (2) 일일 쿼터 여유  (3) 글로벌 비용 캡 미초과
 * quota 는 본인 사용량이라 요청 컨텍스트 client(RLS)로, 글로벌 캡은 adminClient 로 조회.
 * 생성 자체는 호출부가 runAfterResponse 로 background 실행한다.
 */
export async function shouldAnswerInstantly(
  client: SupabaseClient<Database>,
  adminClient: SupabaseClient<Database>,
  userId: string,
): Promise<InstantDecision> {
  const tier = await getUserAiTier(client, userId);
  const toggle = await getQnaAiInstantToggle(client);
  if (!toggle[tier]) return { ok: false, tier, reason: "instant_off" };

  const quota = await getQuotaState(client, userId);
  if (quota.exceeded) return { ok: false, tier, reason: "quota" };

  const cap = await checkGlobalCap(adminClient);
  if (cap.blocked) return { ok: false, tier, reason: "cap" };

  return { ok: true, tier };
}

// ── 즉답 생성·저장 (background) ────────────────────────────────────────────

/** 과목 분류 → 검색 law_code 한정. 코퍼스가 있는 3개 도메인만 override. */
function lawCodesForSubject(subject: string | null): string[] | undefined {
  if (subject === "patent" || subject === "trademark" || subject === "design") {
    return [subject];
  }
  return undefined;
}

export interface InstantAnswerThread {
  threadId: string;
  questionMd: string;
  subject: string | null;
  /**
   * 멀티턴 — 직전 대화(최초 질문·AI/강사 답변·후속 질문). questionMd 가 마지막
   * user 턴으로 뒤에 붙는다. 미지정 = 단일턴(스레드 최초 질문).
   */
  history?: ReadonlyArray<AnswerTurn>;
}

/** 멀티턴 이력 상한 — 오래된 턴은 잘라 토큰을 bound. */
const HISTORY_MAX_TURNS = 8;

/**
 * Haiku RAG 즉답 생성 → 성공 시 qna_messages(ai) 저장 + 스레드 ai_answered 전환.
 * 게이트 차단·모델 거절·빈 응답·에러는 AI 메시지를 만들지 않고 강사 대기(open) 로 둔다.
 * 토큰이 소모된 호출은 거절이라도 글로벌 사용량에 정직히 기록.
 *
 * background(runAfterResponse) 에서 adminClient 로 실행 — 콘텐츠는 공개 읽기,
 * AI 메시지(author_id=null) INSERT 는 RLS 상 service-role 만 가능.
 */
export async function generateInstantAnswer(
  adminClient: SupabaseClient<Database>,
  thread: InstantAnswerThread,
): Promise<void> {
  const question = thread.questionMd.trim();
  if (!question) return;

  try {
    // 운영자 한도 — 컨텍스트 청크 수·최대 출력 토큰(/admin/ai-qna/settings 에서 조정).
    const quotas = await getAiQuotas(adminClient);

    // 도메인 게이트(기본 OFF, env 토글) — 검색 전.
    const gateMode = gateModeFromEnv();
    const preGate = preSearchGate(question, gateMode);
    if (preGate && !preGate.pass) return; // 강사 대기

    const search = await hybridSearch(adminClient, question, {
      topK: quotas.maxContextChunks,
      lawCodesOverride: lawCodesForSubject(thread.subject),
    });

    const postGate = postSearchGate(question, search.hits, gateMode);
    if (!postGate.pass) return; // 강사 대기

    let fullText = "";
    let citations: Citation[] = [];
    let tokenUsage = { input: 0, output: 0 };
    let errored = false;

    const history = (thread.history ?? []).slice(-HISTORY_MAX_TURNS);
    for await (const ev of answerQuestion(
      [...history, { role: "user", content: question }],
      search.hits,
      { maxTokens: quotas.maxOutputTokens, model: QNA_INSTANT_MODEL },
    )) {
      if (ev.type === "text") {
        fullText += ev.delta;
      } else if (ev.type === "done") {
        citations = ev.citations;
        tokenUsage = ev.tokenUsage;
        break;
      } else if (ev.type === "error") {
        errored = true;
        break;
      }
    }

    // 비용은 거절·에러여도 호출됐으면 정직히 누적(글로벌 캡 정합성).
    if (tokenUsage.input > 0 || tokenUsage.output > 0) {
      await recordUsage(
        adminClient,
        QNA_INSTANT_MODEL,
        tokenUsage.input,
        tokenUsage.output,
      );
    }

    if (errored || !fullText.trim()) return; // 강사 대기
    if (classifyRefusal(fullText)) return; // 모델 자체 거절 → 강사 대기

    const { error: insertError } = await adminClient
      .from("qna_messages")
      .insert({
        thread_id: thread.threadId,
        role: "ai",
        author_id: null,
        body_md: fullText,
        citations: citations as unknown as Json,
        retrieval_meta: {
          parsed: search.parsed,
          perPathCounts: search.perPathCounts,
          hitIds: search.hits.map((h) => h.chunkId),
        } as unknown as Json,
        token_usage: {
          input: tokenUsage.input,
          output: tokenUsage.output,
          model: QNA_INSTANT_MODEL,
          status: "success",
        } as unknown as Json,
      });
    if (insertError) {
      console.warn("[qna/ai-answer] 메시지 저장 실패:", insertError.message);
      return;
    }

    // open 상태일 때만 ai_answered 로 전환 — 그 사이 강사가 답했으면 덮지 않음.
    await adminClient
      .from("qna_threads")
      .update({ status: "ai_answered", updated_at: new Date().toISOString() })
      .eq("thread_id", thread.threadId)
      .eq("status", "open");
  } catch (e) {
    // background 작업 — 실패해도 질문은 정상 등록됨(강사 대기). 경고만.
    console.warn(
      "[qna/ai-answer] 즉답 생성 실패:",
      e instanceof Error ? e.message : e,
    );
  }
}
