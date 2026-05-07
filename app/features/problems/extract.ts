// 해설(explanation_md) 텍스트에서 첫 번째 조문번호 / 판례번호 추출.
// admin UI 의 자동 prefill 과 일괄 백필 스크립트가 공용으로 사용.

// 조문 표기 후보:
//   "특허법 제29조 제2항" / "법 제29조" / "法 29" / "제29조" / "특허법 제28조의2"
//   "施規 10" / "시행령 제5조" / "시행규칙 제3조"
// 우선 가지조 (의N) 형태를 먼저 잡고, 없으면 일반 조문.
const ARTICLE_RES: RegExp[] = [
  // "제28조의2" / "제28조 의 2"
  /제\s*(\d+)\s*조\s*의\s*(\d+)/,
  // "특허법 28의2" / "法 28의2"
  /(?:특허법|法|법)\s*(\d+)\s*의\s*(\d+)/,
  // "특허법 제29조" / "법 제29조"
  /(?:특허법|법|法)\s*제?\s*(\d+)\s*조?/,
  // "제29조" 단독
  /제\s*(\d+)\s*조/,
];

export function extractArticleNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const re of ARTICLE_RES) {
    const m = text.match(re);
    if (m) {
      if (m[2]) return `${m[1]}의${m[2]}`;
      return m[1];
    }
  }
  return null;
}

// 판례 표기 후보:
//   "대법원 2013도10265"
//   "대법원 2009. 11. 12. 선고 2007후5215"
//   "특허법원 2008. 6. 26. 선고 2007허13827"
//   "헌재 2010헌마123"
//   "2014후2061" 단독 — court 누락이라 가능한 한 prefix 살리기.
// 가장 정보 많은 형태부터 시도.
const CASE_RES: { re: RegExp; format: (m: RegExpMatchArray) => string }[] = [
  // "대법원|특허법원|헌재|헌법재판소 YYYY. M. D. 선고 NNNN[다후카허]NNNN"
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*선고\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    format: (m) => `${m[1]} ${m[2]}.${m[3]}.${m[4]}. 선고 ${m[5].replace(/\s+/g, "")}`,
  },
  // "대법원 2013도10265" / "대법원 92후1806"
  {
    re: /(대법원|특허법원|헌법재판소|헌재)\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/,
    format: (m) => `${m[1]} ${m[2].replace(/\s+/g, "")}`,
  },
  // 사건번호 단독: "2014후2061" / "92후1806" / "2008허13827"
  {
    re: /\b(\d{2,4}[다후카허헌마]\d+)\b/,
    format: (m) => m[1],
  },
];

export function extractCaseNumber(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const item of CASE_RES) {
    const m = text.match(item.re);
    if (m) return item.format(m);
  }
  return null;
}

// 분류기와 함께 사용: choice_type + 추출된 식별자.
//   - precedent: extractCaseNumber 우선, 실패하면 null.
//   - statute / theory / null: extractArticleNumber.
export function deriveChoiceRefs(
  text: string | null | undefined,
  choiceType: "statute" | "precedent" | "theory" | null,
): { articleNumber: string | null; caseNumber: string | null } {
  if (choiceType === "precedent") {
    return { articleNumber: null, caseNumber: extractCaseNumber(text) };
  }
  return { articleNumber: extractArticleNumber(text), caseNumber: null };
}
