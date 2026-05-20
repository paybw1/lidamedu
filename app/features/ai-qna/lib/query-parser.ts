// feat-9-002 — AI Q&A 질문 전처리.
// 자연어 질문에서 (a) 과목(law_code), (b) 조문 번호, (c) 사건번호를 추출.
// 결과는 (1) 의미검색 law_filter, (2) 구조화 직격 후보, (3) 키워드 검색 보조에 사용.

import {
  extractArticleNumber,
  extractCaseNumber,
} from "~/features/problems/extract";

export interface ParsedQuery {
  /** 식별된 과목 코드들. 0~N 개 — "특허법과 상표법 차이는?" 처럼 2개도 가능. */
  lawCodes: string[];
  /** 식별된 조문 번호들. "29", "28의2" 형식. 1차 — 첫 매치만 신뢰. */
  articleNumbers: string[];
  /** 식별된 사건번호들. "대법원 2018후10844" 또는 단독 "2014후2061" 등 정규화 형태. */
  caseNumbers: string[];
  /** 원문 그대로 (앵커·로깅용). */
  raw: string;
}

// 과목 키워드 → law_code 매핑. "특허법" 이 가장 흔한 형태. 별칭 일부.
const LAW_KEYWORDS: Array<{ regex: RegExp; code: string }> = [
  { regex: /특허법|특허\s*법/, code: "patent" },
  { regex: /상표법|상표\s*법/, code: "trademark" },
  { regex: /디자인보호법|디자인\s*보호\s*법/, code: "design" },
  // 민사소송법 → civil-procedure 가 민법보다 길어서 먼저 매칭해야 함.
  { regex: /민사소송법|민\s*소\s*법/, code: "civil-procedure" },
  { regex: /민법/, code: "civil" },
];

/**
 * 텍스트에서 모든 조문 번호 매치 추출 (반복 스캔). extractArticleNumber 는 첫 1개만 반환.
 * 같은 번호는 중복 제거.
 */
function extractAllArticleNumbers(text: string): string[] {
  const out = new Set<string>();
  // 가지조 (의N) 우선 — "제28조의2" / "특허법 제28조 의 2".
  const branchRe = /(?:제\s*)?(\d+)\s*조\s*의\s*(\d+)/g;
  for (const m of text.matchAll(branchRe)) {
    out.add(`${m[1]}의${m[2]}`);
  }
  // 일반 "제N조" / "법 N조" — 가지조에 이미 잡힌 N 도 다시 잡히나, "의" 가 뒤따르면 가지조로 분류된 게 우선이므로 set 으로 dedup.
  const plainRe = /(?:제\s*)?(\d+)\s*조(?!\s*의)/g;
  for (const m of text.matchAll(plainRe)) {
    // 가지조 위치와 겹치지 않은 경우만. 단순 처리 — 동일 숫자가 가지조 set 에 있어도 의미상 별개로 둔다.
    out.add(m[1]);
  }
  return [...out];
}

/**
 * 텍스트에서 모든 사건번호 추출.
 */
function extractAllCaseNumbers(text: string): string[] {
  const out = new Set<string>();
  const courtRich = /(대법원|특허법원|헌법재판소|헌재)\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*선고\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/g;
  for (const m of text.matchAll(courtRich)) {
    out.add(`${m[1]} ${m[2]}.${m[3]}.${m[4]}. 선고 ${m[5].replace(/\s+/g, "")}`);
  }
  const courtShort = /(대법원|특허법원|헌법재판소|헌재)\s*(\d{2,4}\s*[다후카허헌마]\s*\d+)/g;
  for (const m of text.matchAll(courtShort)) {
    out.add(`${m[1]} ${m[2].replace(/\s+/g, "")}`);
  }
  const bare = /\b(\d{2,4}[다후카허헌마]\d+)\b/g;
  for (const m of text.matchAll(bare)) {
    out.add(m[1]);
  }
  return [...out];
}

export function parseQuestion(raw: string): ParsedQuery {
  const text = raw.trim();
  const lawCodes: string[] = [];
  for (const { regex, code } of LAW_KEYWORDS) {
    if (regex.test(text) && !lawCodes.includes(code)) lawCodes.push(code);
  }

  return {
    lawCodes,
    articleNumbers: extractAllArticleNumbers(text),
    caseNumbers: extractAllCaseNumbers(text),
    raw: text,
  };
}

/**
 * 단일 추출(첫 매치) 헬퍼 — extractCaseNumber/extractArticleNumber 와 동일.
 * 단건이 필요할 때 사용.
 */
export function firstArticleNumber(text: string): string | null {
  return extractArticleNumber(text);
}
export function firstCaseNumber(text: string): string | null {
  return extractCaseNumber(text);
}
