/**
 * Eval item 스키마 (Zod) — questions.jsonl / questions_patent.jsonl 의 한 행.
 *
 * `eval_type` 으로 채점 방식이 갈린다:
 *   - factual      : 컨텍스트·답변 키워드 매칭 + LLM judge (현행)
 *   - refusal      : "본 시스템은 법률 5과목만 다룹니다." 정확 발화 boolean
 *   - no_evidence  : "자료에서 근거를 찾지 못했습니다." 발화 boolean
 *
 * `gold_source` 는 평가 분석용 메타 (어떤 doc_type 의 자료가 정답 근거인가).
 */
import { z } from 'zod';
import { DocTypeSchema, SubjectSchema } from './chunk.js';

export const EvalTypeSchema = z.enum(['factual', 'refusal', 'no_evidence']);
export type EvalType = z.infer<typeof EvalTypeSchema>;

export const RequiresSchema = z.enum(['A_only', 'A_plus_B']);
export type Requires = z.infer<typeof RequiresSchema>;

export const GoldSourceSchema = z.object({
  doc_type: DocTypeSchema.nullable(),     // null = 출처 무관 (예: refusal)
  hint: z.string().nullable(),            // 사람 메모용: "특허법 제30조", "심판편람 §4.2"
});
export type GoldSource = z.infer<typeof GoldSourceSchema>;

export const EvalItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  eval_type: EvalTypeSchema,
  /** factual 일 때만 의미가 있다. refusal/no_evidence 에선 빈 배열이어도 OK. */
  expected_keywords: z.array(z.string()).default([]),
  requires: RequiresSchema,
  subject: SubjectSchema.nullable(),
  gold_source: GoldSourceSchema.optional(),
  note: z.string().optional(),
});
export type EvalItem = z.infer<typeof EvalItemSchema>;

/** 기대 발화 정규식 — refusal/no_evidence 채점에 사용. 정확 발화를 요구하되 약간의 변형 허용. */
export const REFUSAL_PHRASE = /본\s*시스템은\s*법률\s*5\s*과목만\s*다룹니다/;
export const NO_EVIDENCE_PHRASE = /자료에서\s*근거를\s*찾지\s*못했습니다/;

export function detectExpectedBehavior(evalType: EvalType, answer: string): boolean {
  switch (evalType) {
    case 'refusal':     return REFUSAL_PHRASE.test(answer);
    case 'no_evidence': return NO_EVIDENCE_PHRASE.test(answer);
    case 'factual':     return true; // factual 은 기대 행동 채점이 없음
  }
}
