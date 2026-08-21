// 판례 도식의 법조문 표기 → 조문 식별자 해석용 정규화 (원장 지적 2026-08-21).
//
// 도식의 법조문은 판결문 표기를 그대로 옮긴 문자열이 권위다(설계 §3 — FK 로 저장하지 않는다).
// 그런데 판결문은 "구 특허법 제89조 제1항", "특허법 제29조 제1항 본문" 처럼 쓰기 때문에
// identifier.ts 의 DISPLAY_RE(법령명으로 시작해 목으로 끝나는 정규식)가 통째로 실패한다.
// 실측: 도식 183건의 법조문 표기 297종 중 167종이 해석 실패였고 그중 91종이 "구 " 접두였다.
//
// 여기서는 **표기를 바꾸지 않고**(원문 보존) 해석용 사본만 다듬는다.

// 법령명 앞에 붙는 시점 수식어 — "구", "종전", "개정", "2009년 개정" 등. 겹쳐 쓰기도 한다.
const ERA_PREFIX = /^(?:(?:\d{4}년\s*)?(?:구|현행|종전|개정)\s+)+/;

// ★시행령·시행규칙·부칙은 조문 DB 에 없다. 수식어만 떼면 "특허법 시행령 제5조" 가
//   "특허법 제5조" 로 읽혀 엉뚱한 조문에 링크된다 — 아예 해석 대상에서 뺀다.
const NOT_AN_ARTICLE = /(시행령|시행규칙|부칙|조약|규칙\s*제)/;

/** 도식 법조문 표기의 해석 결과. */
export interface StatuteRef {
  /** article = 과목 조문(학습화면 있음) · reference = 참조 법령 조문(팝업 전용). */
  kind: "article" | "reference";
  id: string;
}

/** 개정 전·종전 법령 표기인가. UI 에서 "현행 조문으로 이어진다"고 밝히는 데 쓴다. */
export function isOldLawLabel(raw: string): boolean {
  return ERA_PREFIX.test(raw.trim());
}

/**
 * 해석용 정규화. 실패해도 원 표기는 그대로 화면에 남으므로 공격적으로 다듬어도 안전하다.
 *
 *   "구 특허법 제89조 제1항"                              → "특허법 제89조 제1항"
 *   "구 특허법(2001. 2. 3. 법률 제6411호로…) 제40조 제2항" → "특허법 제40조 제2항"
 *   "특허법 제29조 제1항 본문"                            → "특허법 제29조 제1항"
 *   "특허법 제133조(특허무효심판)"                        → "특허법 제133조"
 *   "특허법 제2조 제3호 (가)목"                           → "특허법 제2조 제3호 가목"
 *   "특허법 제128조 제1항 내지 제5항"                     → "특허법 제128조 제1항"
 *   "특허법 시행령 제5조"                                 → (그대로 — 해석 대상 아님)
 *
 * ★시점 수식어를 떼면 현행 조문으로 이어진다. 조문 내용이 그때와 다를 수 있으나, 학습
 *   정책이 "기출도 현행법으로 푼다" 이므로 현행 조문을 보여주는 편이 맞다. 다만 화면에서는
 *   isOldLawLabel 로 구법 표기임을 밝혀 학생이 혼동하지 않게 한다.
 */
export function normalizeStatuteLabel(raw: string): string {
  const trimmed = raw.trim();
  if (NOT_AN_ARTICLE.test(trimmed)) return trimmed;
  return (
    trimmed
      // 개정연혁 등 괄호 주석 — "(2001. 2. 3. 법률 제6411호로 개정되기 전의 것)",
      // "(특허무효심판)". 단 "(가)목" 의 괄호는 아래에서 따로 살린다.
      .replace(/\((?![가-하]\)\s*목)[^)]*\)/g, " ")
      .replace(/\s+/g, " ")
      .replace(ERA_PREFIX, "")
      // "(가)목" → "가목"
      .replace(/\(\s*([가-하])\s*\)\s*목/g, "$1목")
      // 항·호 나열과 범위 — "제1항, 제2항", "제1항 내지 제5항". 조문 단위 미리보기라
      // 첫 항만 남기면 충분하다.
      .replace(/\s*(?:,|·|및|내지|또는|~)\s*제\s*\d+\s*[항호][\s\S]*$/, "")
      // 조문 안의 위치 지시어 — 여기까지는 구분하지 않는다.
      .replace(/\s*(본문|단서|전단|후단|전문|후문|각 호 외의 부분)\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** 5과목이 아닌 법령의 조문 표기 — "공정거래법 제19조 제1항" → 법령명 + 조문번호. */
export interface ReferenceStatuteRef {
  lawName: string;
  /** articles.article_number 와 같은 표기 — "19", "126의2". */
  articleNumber: string;
}

const REFERENCE_RE = /^(.+?)\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s|$)/;

/**
 * 정규화된 표기에서 법령명과 조문번호를 뽑는다. 법령명이 실제 존재하는지는 보지 않는다 —
 * 호출부가 reference_laws 와 대조해 걸러낸다("프랑스 민법", "특허법 시행령"은 거기서 탈락).
 */
export function parseReferenceStatute(label: string): ReferenceStatuteRef | null {
  const m = REFERENCE_RE.exec(normalizeStatuteLabel(label));
  if (!m) return null;
  const lawName = m[1].trim();
  if (!lawName) return null;
  return { lawName, articleNumber: m[3] ? `${m[2]}의${m[3]}` : m[2] };
}
