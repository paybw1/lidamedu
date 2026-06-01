/**
 * 질문 텍스트에서 조문 참조 추출 — 조문 검색 보정용.
 *
 * 본 repo `app/features/laws/lib/identifier.ts` 의 정규식 패턴을 단순화·차용 (복제만).
 * 예:
 *   "특허법 제30조"             → [{law_code:'patent', article:30}]
 *   "특허법 제29조 제3항"       → [{law_code:'patent', article:29, clause:3}]
 *   "제125조"                   → [{law_code:null, article:125}]
 *   "상표법 제33조 제1항 제3호" → [{law_code:'trademark', article:33, clause:1, item:3}]
 *
 * law_code 가 null 이면 "어느 법" 인지 미정 — 검색 보정에서는 article number 매칭만으로 부스트.
 */
export interface ArticleRef {
  law_code: string | null;       // 'patent' | 'trademark' | 'design' | 'civil' | 'civil-procedure'
  article: number;
  clause: number | null;
}

const LAW_NAME_MAP: Record<string, string> = {
  '특허법': 'patent',
  '상표법': 'trademark',
  '디자인보호법': 'design',
  '디보법': 'design',
  '민법': 'civil',
  '민사소송법': 'civil-procedure',
  '민소': 'civil-procedure',
};

// 조문번호: "제N조" 또는 "제N조의M" 가지조도 N만 캡처
// 항번호: " 제M항" optional
// 본 단계에선 호·목 무시 (조문 부스트 정확도엔 큰 영향 없음)
const REF_RE = /(특허법|상표법|디자인보호법|디보법|민법|민사소송법|민소)?\s*제\s*(\d+)\s*조(?:\s*의\s*\d+)?(?:\s*제\s*(\d+)\s*항)?/g;

export function extractArticleRefs(text: string): ArticleRef[] {
  const out: ArticleRef[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  // exec 루프 — REF_RE 는 g 플래그
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(text)) !== null) {
    const lawName = m[1] ?? null;
    const article = parseInt(m[2] ?? '0', 10);
    const clauseStr = m[3];
    const clause = clauseStr ? parseInt(clauseStr, 10) : null;
    if (!Number.isFinite(article) || article <= 0) continue;
    const law_code = lawName ? (LAW_NAME_MAP[lawName] ?? null) : null;
    const key = `${law_code ?? '*'}:${article}:${clause ?? '-'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ law_code, article, clause });
  }
  return out;
}
