// feat-9-003 — 답변 텍스트의 [N] 마커 → citations 매핑.
// ai_messages.citations JSONB 호환 형태 (feat-9-004 에서 영구 저장).

import type { ContextItem } from "./system-prompt";

export interface Citation {
  /** 답변 안 마커 N (1-base). */
  label: number;
  chunkId: string;
  sourceType: "article" | "case" | "problem";
  sourceId: string;
  headingPath: string;
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
    });
  }
  return out;
}
