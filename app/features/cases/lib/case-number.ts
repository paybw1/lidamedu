// 사건번호 정규화·매칭 단일 소유 — 입력·API응답·cases 3곳 모두 이 함수 통과.
//
// 표준 토큰 패턴:  (\d{2,4}) (가-힣{1,3}) (\d{1,8})
//   e.g. "2012후726", "2018후10848", "2023다231738", "85후31"
//
// 다양한 입력 정상화:
//   "2012후726"                                     → "2012후726"
//   "2012 후 726"                                   → "2012후726"   (공백 허용)
//   "2012.후.726"                                   → "2012후726"   (점 허용)
//   "대법원 2013.2.28. 선고 2012후726 판결"          → "2012후726"   (헤더 포함)
//   "  2012후726  "                                  → "2012후726"
//   "정보없음", null, ""                             → null         (실패 — 추정 금지)
//
// 헤더에 사건번호가 2건 이상 병합된 경우(공동심리) — 본 함수는 마지막 매치 선택.
// 다수 매치 여부가 중요한 곳(매칭 안전망)은 `extractAllCaseNumbers` 사용.

const CORE_PATTERN =
  /(?<![\d가-힣])(\d{2,4})\s*\.?\s*([가-힣]{1,3})\s*\.?\s*(\d{1,8})(?![\d가-힣])/g;

/**
 * 입력 문자열에서 핵심 사건번호 토큰만 추출해 정규화.
 * 매치 없으면 null — 매칭 실패는 호출자가 명시적으로 보고/스킵.
 */
export function normalizeCaseNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw);
  const all = extractAllCaseNumbers(s);
  if (all.length === 0) return null;
  // 헤더 + 본 사건번호 형태에선 마지막이 본 번호. 단건이면 동일.
  return all[all.length - 1];
}

/**
 * 한 문자열에서 모든 사건번호 토큰을 순서대로 추출. 중복 제거.
 */
export function extractAllCaseNumbers(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const re = new RegExp(CORE_PATTERN.source, "g");
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const token = `${m[1]}${m[2]}${m[3]}`;
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

/**
 * 양쪽 모두 정규화 가능하고 정확 일치할 때만 true.
 * 한쪽이라도 null → false (느슨한 매칭 금지).
 */
export function caseNumbersEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeCaseNumber(a);
  const nb = normalizeCaseNumber(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * 3중 매칭 안전망 — §2 dry-run 의 핵심.
 * 입력·목록 응답·본문 응답·cases 컬럼 모두 같은 토큰이어야 통과.
 *
 *   (1) 입력            == 목록 응답 prec 의 사건번호   (API 측 정확 매칭)
 *   (2) 목록 응답        == 본문 응답 사건번호           (API 자체 일관성)
 *   (3) 본문 응답        == cases.case_number             (DB 측 정확 매칭)
 *
 * 하나라도 불일치 → reason 반환. 모든 reason 이 null 이면 안전.
 */
export type MatchVerification = {
  inputToken: string | null;
  listToken: string | null;
  serviceToken: string | null;
  dbToken: string | null;
  reason: string | null;
};
export function verifyTripleMatch(args: {
  inputRaw: string;
  listSeenRaw: string | null;
  serviceSeenRaw: string | null;
  dbSeenRaw: string | null;
}): MatchVerification {
  const inputToken = normalizeCaseNumber(args.inputRaw);
  const listToken = normalizeCaseNumber(args.listSeenRaw);
  const serviceToken = normalizeCaseNumber(args.serviceSeenRaw);
  const dbToken = normalizeCaseNumber(args.dbSeenRaw);

  let reason: string | null = null;
  if (!inputToken) reason = "input_unparseable";
  else if (!listToken) reason = "list_response_missing_case_number";
  else if (inputToken !== listToken)
    reason = `mismatch_input_vs_list (${inputToken} ≠ ${listToken})`;
  else if (!serviceToken) reason = "service_response_missing_case_number";
  else if (listToken !== serviceToken)
    reason = `mismatch_list_vs_service (${listToken} ≠ ${serviceToken})`;
  else if (!dbToken) reason = "db_row_missing_case_number"; // cases 매칭 실패 케이스도 여기로
  else if (serviceToken !== dbToken)
    reason = `mismatch_service_vs_db (${serviceToken} ≠ ${dbToken})`;

  return { inputToken, listToken, serviceToken, dbToken, reason };
}
