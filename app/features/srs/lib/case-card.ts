// feat-2-023b — 판례 암기 카드 front 구성 순수 헬퍼(무의존 — 클라/서버/스크립트 공용).
// front = 〔식별자(인용)〕 + 〔쟁점 질문〕. "[N]" 쟁점 번호 제거·중복 회피,
// item.title 이 번호뿐이면 case_title + "(쟁점 N)" 폴백.

/** 앞 "[N] " 쟁점 번호 prefix 제거. */
export function stripIssueNumber(s: string | null): string {
  return (s ?? "").replace(/^\s*\[\d+\]\s*/, "").trim();
}

/** "[4]" 처럼 번호만인 제목 → 숫자(없으면 null). */
function bareIssueNumber(s: string | null): number | null {
  const m = (s ?? "").trim().match(/^\[(\d+)\]$/);
  return m ? Number(m[1]) : null;
}

/**
 * 쟁점 질문 1줄 — item.title 우선(번호 prefix 제거), 번호뿐이면 case_title + "(쟁점 N)" 폴백.
 * idx = 0-based 항목 순번(폴백 번호용).
 */
export function composeCaseTopic(
  itemTitle: string | null,
  caseTitle: string | null,
  idx: number,
): string {
  const item = stripIssueNumber(itemTitle);
  if (item) return item;
  const n = bareIssueNumber(itemTitle) ?? idx + 1;
  const base = stripIssueNumber(caseTitle) || "쟁점";
  return `${base} (쟁점 ${n})`;
}

/** front = 인용 줄 + 쟁점 줄(러너 whitespace-pre-line 으로 개행 보존). */
export function composeCaseFront(citation: string, topic: string): string {
  return `${citation}\n${topic}`;
}
