// feat-9 v4 — 모델별 단가표 (USD per 1M tokens).
//
// **하드코딩 금지** 원칙: 단가는 본 파일에서만 정의, 다른 곳에서 import.
// 단가 변경 시 본 파일 한 줄만 수정. 향후 시간대별·계약별 차등 단가 도입 시 함수화.
//
// 출처 (2026-05 기준 공개 가격, 변동 가능 — 갱신 시 본 주석도 함께 수정):
//   - Claude Sonnet 4.6   : $3.00 / $15.00 (input / output per 1M)
//   - Claude Haiku  4.5   : $1.00 / $5.00
//   - Voyage  voyage-3-large : $0.18 (input only — 임베딩은 output 없음)

export interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
}

export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  "claude-sonnet-4-6":        { inputPerM: 3.0,  outputPerM: 15.0 },
  "claude-haiku-4-5-20251001": { inputPerM: 1.0, outputPerM: 5.0 },
  "voyage-3-large":           { inputPerM: 0.18, outputPerM: 0 },
};

/** model 이 PRICING 에 없으면 0 반환 (보수적: 알 수 없는 호출은 비용 0으로 기록 → 분석 시 모름이라 표시) */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (
    (inputTokens / 1_000_000) * p.inputPerM
    + (outputTokens / 1_000_000) * p.outputPerM
  );
}
