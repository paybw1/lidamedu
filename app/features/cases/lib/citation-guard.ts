// ★★생성 단계 차단 — AI 초안이 **실재하지 않는 사건번호**를 쓰지 못하게 한다.
//
// CLAUDE.md Non-negotiable 12. 사후 감사만으로는 못 막는다는 것이 2026-09-01 에 드러났다:
// 2차 훈련 논점의 인용 3건이 지어낸 번호였는데(2005후3352·2009후3919·2015다257538)
// **법리 서술은 맞아서** 사람이 읽어도 안 잡혔고, 공개 DB 조회로는 "없음"을 확정할 수도 없었다
// (법령정보센터 누락·casenote rate limit 때문에 실재 판례를 지어냄으로 몰 뻔한 일이 네 번).
//
// 그래서 **양성 확인만 신뢰**한다: 우리가 근거를 가진 번호만 쓰게 하고, 나머지는 못 쓰게 한다.
//   허용 = ① `cases.case_number` ② `case_lower_courts.lower_case_number`
//          ③ 우리가 가진 판결문 원문이 인용하고 있는 번호(다른 판결이 인용 = 실재)
//          ④ 그 초안이 딛고 선 소스 원문에 있는 번호
//   그 밖 = **번호를 빼고 법리만** 쓰게 한다.
//
// 순수 모듈 — 서버·스크립트 양쪽에서 쓴다(서버 전용 import 금지).

/** 사건번호 패턴. 조·항·호·목 뒤는 사건번호가 아니다(조문 표기 오인 방지). */
const CASE_NO_RE = /\b\d{2,4}(?!조|항|호|목)[가-힣]{1,3}\d+\b/g;

/**
 * 유효한 법원 사건부호 화이트리스트.
 * ★블랙리스트로는 "제29조의2" 의 "29의2" 를 못 걸러 대량 오탐이 났다(2026-09-01).
 */
const CASE_MARKS = new Set([
  "후", "다", "도", "두", "마", "므", "그", "오", "초", "재다", "재후", "허",
  "가합", "가단", "가소", "나", "라", "고합", "고단", "고정", "노", "로",
  "구합", "구단", "누", "카합", "카단", "카기", "즈합", "즈단", "비", "드합", "드단",
]);

/**
 * 특허심판원 심판번호 부호 — 법원 판결이 아니다.
 * 심결 경위를 옮겨 적는 것은 정상이므로 **검사 대상에서 뺀다**(빼지 않으면 전부 오탐).
 */
const TRIAL_MARKS = new Set(["당", "원", "정", "취", "소", "재"]);

const markOf = (no: string): string =>
  no.replace(/^\d+/, "").replace(/\d+$/, "");

/** 공백 제거 — 판결문은 줄바꿈이 사건번호 가운데를 벌려 놓는다. */
export const flattenCaseNo = (s: string): string => s.replace(/\s+/g, "");

export function isCourtCaseNumber(no: string): boolean {
  return CASE_MARKS.has(markOf(no));
}

export function isTrialNumber(no: string): boolean {
  return TRIAL_MARKS.has(markOf(no));
}

/** 텍스트에서 법원 사건번호만 뽑는다(심판번호·조문 표기 제외). */
export function extractCaseNumbers(text: string): string[] {
  return [...new Set(text.match(CASE_NO_RE) ?? [])].filter(isCourtCaseNumber);
}

export interface CitationCheck {
  /** 근거가 확인되지 않은 사건번호. 비어 있으면 통과. */
  unknown: string[];
  /** 근거가 확인된 사건번호. */
  known: string[];
}

/**
 * 생성 결과의 인용 사건번호를 검사한다.
 *
 * @param text 검사할 생성 결과
 * @param allowed 허용 집합 — `flattenCaseNo` 로 정규화된 번호들(DB + 판결문 인용)
 * @param sourceText 그 초안이 딛고 선 원문(있으면 여기 있는 번호도 허용)
 */
export function checkCitations(
  text: string,
  allowed: ReadonlySet<string>,
  sourceText?: string | null,
): CitationCheck {
  const flatSource = sourceText ? flattenCaseNo(sourceText) : "";
  const unknown: string[] = [];
  const known: string[] = [];
  for (const no of extractCaseNumbers(text)) {
    const flat = flattenCaseNo(no);
    if (allowed.has(flat) || (flatSource && flatSource.includes(flat))) {
      known.push(no);
    } else {
      unknown.push(no);
    }
  }
  return { unknown, known };
}

/**
 * 근거 없는 인용을 **문장에서 걷어낸다**.
 *
 * ★번호만 지우면 "(대법원  등)" 같은 흉터가 남는다 — 번호를 감싼 괄호구를 통째로 지운다.
 *   "…판단한다(대법원 2005후3352 등)." → "…판단한다."
 * ★괄호 밖에 쓰인 경우(예: "대법원 2005후3352 판결에 따르면")는 문장 구조를 건드리게 되므로
 *   **자동으로 지우지 않는다** — 그런 항목은 사람이 고치도록 남긴다(반환값 leftover 로 알린다).
 */
export function stripUnknownCitations(
  text: string,
  unknown: readonly string[],
): { text: string; leftover: string[] } {
  let out = text;
  const leftover: string[] = [];
  for (const no of unknown) {
    // 번호를 담은 괄호구 전체를 지운다(앞의 공백까지).
    const paren = new RegExp(
      `\\s*[（(][^（()）]*${no}[^（()）]*[）)]`,
      "g",
    );
    const before = out;
    out = out.replace(paren, "");
    if (out === before) leftover.push(no);
  }
  return { text: out, leftover };
}

/** 생성 프롬프트에 붙이는 규칙 — 모델에게도 같은 규칙을 알려 준다. */
export const CITATION_PROMPT_RULE = `
# 사건번호 인용 규칙 (반드시 지킬 것)
- 사건번호는 **제공된 자료(판결문 원문·소스)에 실제로 적힌 것만** 인용합니다.
- 기억에 의존해 사건번호를 쓰지 마세요. **법리가 맞아도 번호가 틀리면 잘못된 정보입니다.**
- 근거가 되는 사건번호를 확인할 수 없으면 **번호를 쓰지 말고 법리만** 서술하세요
  ("판례는 ~라고 본다" 로 충분합니다).
- 특허심판원 심판번호(2019당3367 등)는 판결문에 적힌 그대로만 옮깁니다.`;

export interface ScrubResult {
  /** 걷어낸 뒤의 본문. */
  text: string;
  /** 괄호구째 지워 낸 근거 없는 번호. */
  removed: string[];
  /** 지우면 문장이 깨져 **사람이 고쳐야 하는** 번호. */
  leftover: string[];
}

/**
 * 검사 + 제거를 한 번에 — DB 로 바로 들어가는 생성물용.
 *
 * 근거가 확인되지 않은 번호 중 괄호 인용만 지우고, 문장에 박힌 것은 남겨 알린다.
 * ★검수 단계가 따로 있는 오프라인 산출물(jagwa 채점기준·모범답안)에는 쓰지 않는다 —
 *   거기서는 지우지 않고 경고만 남긴다. 실재하지만 우리 DB 에 없는 번호가 335종 있어
 *   자동 삭제하면 맞는 인용까지 지워지고, 그쪽은 사람이 반드시 한 번 읽는 경로다.
 */
export function scrubCitations(
  text: string,
  allowed: ReadonlySet<string>,
  sourceText?: string | null,
): ScrubResult {
  const { unknown } = checkCitations(text, allowed, sourceText);
  if (unknown.length === 0) return { text, removed: [], leftover: [] };
  const res = stripUnknownCitations(text, unknown);
  const leftover = new Set(res.leftover);
  return {
    text: res.text,
    removed: unknown.filter((n) => !leftover.has(n)),
    leftover: res.leftover,
  };
}

/**
 * 허용 집합이 "그 초안이 딛고 선 원문뿐" 일 때 쓰는 빈 집합.
 * 판례 1건·문항 1건에서 뽑는 초안은 DB 전체를 허용할 이유가 없다 —
 * 그 원문에 적힌 번호만 옮겨 적으면 된다(가장 엄격하고, 가장 안전하다).
 */
export const EMPTY_ALLOWED: ReadonlySet<string> = new Set<string>();
