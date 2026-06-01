/**
 * 외부 API 비용 추정 — 호출 전 사용자 confirm 용.
 * 가격은 2026 기준 공개치 추정. 실제 청구는 Voyage / Anthropic 콘솔 기준.
 */
export const PRICING_USD_PER_1M = {
  voyage_3_large_input: 0.18,
  claude_sonnet_4_6_input: 3.0,
  claude_sonnet_4_6_output: 15.0,
};

export function fmtUsd(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}

export function estimateEmbedCost(totalTokens: number): { usd: number; line: string } {
  const usd = (totalTokens / 1_000_000) * PRICING_USD_PER_1M.voyage_3_large_input;
  return {
    usd,
    line: `Voyage voyage-3-large input ≈ ${totalTokens.toLocaleString()} tok × $${PRICING_USD_PER_1M.voyage_3_large_input}/1M = ${fmtUsd(usd)}`,
  };
}
