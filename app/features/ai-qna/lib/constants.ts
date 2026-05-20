// feat-9 — AI Q&A 단일 소유 상수.
// docs/features/feat-9-ai-qna.md §14 권장안 채택분 (2026-05-20 결정).

/** 임베딩 모델 — Voyage `voyage-3-large`. 차원은 EMBEDDING_DIMS 와 동기. */
export const EMBEDDING_MODEL = "voyage-3-large" as const;

/**
 * content_chunks.embedding vector(N) 의 N. **테이블 생성 시 고정**.
 * 변경하려면 마이그레이션으로 컬럼 재정의 + 전체 재임베딩 필요.
 */
export const EMBEDDING_DIMS = 1024 as const;

/** 답변 생성 LLM — Claude Sonnet 4.6 단일 모델 (분기 없음). */
export const AI_QNA_MODEL = "claude-sonnet-4-6" as const;

/** 무료 사용자 일 한도 (KST 자정 기준). */
export const AI_QNA_FREE_DAILY = 5 as const;

/** 회원3(area_study_mgmt 보유) 일 한도. */
export const AI_QNA_TIER1_DAILY = 50 as const;

/** 멀티턴 컨텍스트 — 직전 N 턴(user+assistant 페어 단위가 아니라 메시지 단위). */
export const AI_QNA_MULTITURN_LIMIT = 4 as const;

/** 자연과학 4과목은 v1 코퍼스 제외. */
export const AI_QNA_EXCLUDE_SCIENCE = true as const;
