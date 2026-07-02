// 문제 고유 표시번호(display_no) ↔ 사람이 부르는 코드 "P-{n}" 변환. 순수.
// 인용·Q&A 특정용. display_no 는 전역 시퀀스(불변).

const PREFIX = "P-";

/** display_no → 표시 코드. 예: 10342 → "P-10342". */
export function formatProblemCode(displayNo: number): string {
  return `${PREFIX}${displayNo}`;
}

/**
 * 사용자 입력 → display_no. "P-10342" / "p 10342" / "10342" 모두 허용.
 * 숫자를 못 찾으면 null.
 */
export function parseProblemCode(input: string): number | null {
  const m = input.trim().match(/(\d{1,})/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
