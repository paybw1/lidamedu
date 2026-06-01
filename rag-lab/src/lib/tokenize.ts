/**
 * 토큰 카운트 근사 — 외부 라이브러리 없이 한국어 친화 휴리스틱.
 * 단계 ④ 의 인덱싱·비용 계산은 실제 임베딩 모델 tokenizer 로 갈음하고,
 * 본 함수는 청크 분할/통계 표시용 근사값으로만 쓴다.
 *
 * 경험식: 한국어 한 글자 ≈ 0.7 토큰, 영문은 ~0.25 토큰/char.
 * 보수적으로 max(0.5 × char, 1) 사용.
 */
export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length * 0.5));
}
