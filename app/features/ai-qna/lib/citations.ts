// feat-9-003 — 답변 텍스트의 [N] 마커 → citations 매핑.
// ai_messages.citations JSONB 호환 형태 (feat-9-004 에서 영구 저장).

import type { ContextItem } from "./system-prompt";

/**
 * v5-④ : doc_type 별 사용자 표시 라벨. system-prompt 7번(도메인 일치)·4번(1차/2차 충돌 시 1차 우선)
 * 과 일관성 유지. 라벨은 답변 본문에서 [N] 마커 옆에 모델이 직접 적기보다는 출처 카드 UI 에서 표시.
 */
export const DOC_TYPE_LABEL = {
  article:  "법령",
  case:     "판례",
  problem:  "문제",
  textbook: "기본서",
  practice: "실무서",
  // feat-9-010 — 강사 질의응답 아카이브(qna_threads 소급 적재분 포함). 강사 공인 답변 = 1차.
  qna:      "강사 Q&A",
} as const satisfies Record<
  "article" | "case" | "problem" | "textbook" | "practice" | "qna",
  string
>;

export type CitationSourceType = keyof typeof DOC_TYPE_LABEL;

export interface Citation {
  /** 답변 안 마커 N (1-base). */
  label: number;
  chunkId: string;
  sourceType: CitationSourceType;
  sourceId: string;
  headingPath: string;
  /**
   * v5-④ : 1=1차 (법령·판례·문제) / 2=2차 (기본서·실무서). 답변 출처 등급·UI 배지에 사용.
   * v5 이전(historical) 저장 행은 본 필드 없음 — 읽을 때 default 1 fallback.
   */
  authorityTier?: 1 | 2;
}

/**
 * 전체 답변에서 `[N]` 마커를 추출 → ContextItem 와 매핑.
 * - 중복 라벨은 1회만 포함
 * - ContextItem 에 없는 라벨(=환각/오인용) 은 제외
 * - 등장 순서 보존
 */
export function extractCitations(
  fullText: string,
  items: ReadonlyArray<ContextItem>,
): Citation[] {
  const byLabel = new Map(items.map((it) => [it.label, it]));
  const seen = new Set<number>();
  const out: Citation[] = [];
  // [1], [12], 또는 연달아 [1][2] 도 매치.
  const re = /\[(\d+)\]/g;
  for (const m of fullText.matchAll(re)) {
    const n = parseInt(m[1], 10);
    if (!Number.isFinite(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    const item = byLabel.get(n);
    if (!item) continue; // 컨텍스트 밖 라벨 — 환각으로 처리, 무시.
    out.push({
      label: item.label,
      chunkId: item.chunkId,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      headingPath: item.headingPath,
      authorityTier: item.authorityTier,
    });
  }
  return out;
}
