// GS 비용 산정 — Claude (AI 채점/초안) + Google Vision (OCR).
//
// **하드코딩 금지** 원칙: 단가는 본 파일에서만 정의. 변경 시 본 파일과 주석을 함께 수정.
// 1차 RAG 의 `ai-qna/lib/pricing.ts` 와 분리한 이유:
//   - 사용 모델 차이 (GS 는 Opus 4.7 채점, 1차 RAG 는 Sonnet 4.6)
//   - OCR 단가는 token 이 아니라 페이지 단위 → 별도 함수
//   - 단가 변경 시 두 흐름이 서로 영향 없게
//
// 출처 (2026-06 기준 공개 가격, 변동 가능 — 갱신 시 본 주석도 함께 수정):
//   - Claude Opus 4.7    : $5.00 / $25.00 (input / output per 1M)
//   - Claude Sonnet 4.6  : $3.00 / $15.00
//   - Google Cloud Vision DOCUMENT_TEXT_DETECTION : ~$1.50 per 1,000 페이지 → $0.0015 / page
//     (Vision 첫 1000건/월 무료. 본 단가는 무료 한도 이후 평균치. 환경변수로 override 가능)

export interface AiModelPricing {
  inputPerM: number;
  outputPerM: number;
}

export const GS_AI_MODEL_PRICING: Readonly<Record<string, AiModelPricing>> = {
  "claude-opus-4-7": { inputPerM: 5.0, outputPerM: 25.0 },
  "claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
};

/** AI 모델 비용 추정. 알 수 없는 모델은 0 (모름 표시) — 보수적 fallback. */
export function estimateAiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = GS_AI_MODEL_PRICING[model];
  if (!p) return 0;
  return (
    (inputTokens / 1_000_000) * p.inputPerM +
    (outputTokens / 1_000_000) * p.outputPerM
  );
}

/**
 * Vision OCR 페이지당 단가 (USD).
 * 환경변수 `GS_OCR_PAGE_USD` 로 override 가능 (Vision 가격 변동·할인 계약 대응).
 * 0 미만/NaN/누락이면 기본 $0.0015.
 */
export function ocrPageCostUsd(): number {
  const raw = process.env.GS_OCR_PAGE_USD;
  if (!raw) return 0.0015;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < 0) return 0.0015;
  return v;
}

/** OCR 호출 비용 추정. pages 는 일반적으로 1 (1 호출 = 1 페이지). */
export function estimateOcrCostUsd(pages: number): number {
  return Math.max(0, pages) * ocrPageCostUsd();
}

/** Vision OCR 모델 식별자 (로그용 — DB enum 아님). */
export const OCR_MODEL_ID = "gcv-doctext";
