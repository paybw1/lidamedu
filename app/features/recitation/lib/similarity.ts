// 암기 모드 — 입력 텍스트와 정답 텍스트의 유사도 계산.
// 정답: 조문 본문의 cumulative inline text. 운영자가 underline/subtitle/annotation 등으로 분할해도
// 학생 관점에선 통합된 한 흐름으로 평가.

// 비교 전 normalization — 한글 본문 비교에 의미없는 차이 제거.
//   - 모든 공백 (스페이스, tab, 개행) 제거 → 학생이 띄어쓰기 다르게 해도 무방
//   - 마침표/쉼표/괄호/따옴표 등 구두점 제거
//   - 한자/영문은 보존 (조문 안에 등장하면 정답의 일부)
//   - amendment_note 형식 (<개정 ...>, [전문개정 ...]) 은 비교에서 제외해야 함 — 학생이 외울 필요 없음.
//     → cumulativeText 만들 때 amendment_note 를 제외한 변형이 따로 필요.
export function normalizeForComparison(s: string): string {
  return s
    .replace(/<[^>]*>/g, "") // <개정 2016.3.29.> 같은 메타
    .replace(/\[[^\]]*개정[^\]]*\]/g, "") // [전문개정 ...]
    .replace(/\[[^\]]*신설[^\]]*\]/g, "")
    .replace(/\[[^\]]*시행[^\]]*\]/g, "")
    .replace(/\s+/g, "")
    .replace(/[.,;:·ㆍ"'`!?\(\)\[\]\{\}「」『』<>《》〈〉]/g, "")
    .toLowerCase();
}

// Levenshtein edit distance — O(m*n) 메모리. 본문 비교용으로 충분.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // 두 줄짜리 rolling row.
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insert
        prev[j] + 1, // delete
        prev[j - 1] + cost, // substitute
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

// 정답과의 유사도 0..1 — 1.0 = 완전 일치. 정규화 후 Levenshtein 기반.
// 빈 입력은 0, 정규화 후 빈 정답은 1.0 (원래 비어있는 block).
export function computeSimilarity(input: string, expected: string): number {
  const a = normalizeForComparison(input);
  const b = normalizeForComparison(expected);
  if (b.length === 0) return a.length === 0 ? 1 : 0;
  if (a.length === 0) return 0;
  const d = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1 - d / maxLen);
}

// 완성으로 간주할 임계치. 기본 0.9 (90%).
export const RECITATION_PASS_THRESHOLD = 0.9;

export function isRecitationComplete(similarity: number): boolean {
  return similarity >= RECITATION_PASS_THRESHOLD;
}
