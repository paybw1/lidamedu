// 한국시간(KST) 판정 — 단일 소스 (feat-11-012 P5-c).
//
// ★2026-09-13 발견: 쿠폰함은 **세계표준시 날짜**로, 결제 검증은 **한국 날짜**로 유효기간을
//   판정했다. 그래서 매일 KST 00:00~09:00 아홉 시간 동안 어제 만료된 쿠폰이 쿠폰함에는
//   「사용 가능」으로 남아 있다가 결제에서 거절됐다. 두 곳이 같은 자를 쓰게 한다.
//
// ★두 종류를 구분해 둔다. 섞으면 하루가 어긋난다.
//   ① 달력일 판정 — `date` 컬럼(coupons.valid_from/valid_to)처럼 "날짜"인 값.
//   ② 순간 비교   — `timestamptz`(grant.expires_at 등)처럼 "시각"인 값.
// ★시각을 **문자열 사전순으로 비교하지 않는다.** PostgREST 는
//   `2026-08-14T02:01:07.304+00:00` 처럼 오프셋이 붙은 형태로 돌려주므로, `Z` 로 끝나는
//   `new Date().toISOString()` 과 사전순 비교하면 틀린다.
// ★클라이언트·서버 공용(순수 모듈) — `.server` 를 import 하지 않는다.
// ★지금 옮긴 것은 쿠폰·포인트 경로뿐이다. 같은 오프셋 상수가 정산 쪽에 더 복제돼 있으나,
//   정산은 회귀 위험이 커서 이번 묶음에 넣지 않았다(후속).

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금의 KST 달력일 (yyyy-mm-dd). */
export function kstToday(now: Date | number = Date.now()): string {
  const ms = typeof now === "number" ? now : now.getTime();
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 어떤 시각의 KST 달력일. 값이 없으면 null. */
export function kstDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 달력일 비교 — a 가 b 보다 **이전 날짜**인가.
 * 둘 다 yyyy-mm-dd 라 사전순 비교가 곧 날짜 비교다.
 */
export function isBeforeKstDay(a: string, b: string): boolean {
  return a.slice(0, 10) < b.slice(0, 10);
}

/**
 * 순간 비교 — 이 시각이 이미 지났는가(만료됐는가).
 * ★문자열이 아니라 **시각 값**으로 비교한다.
 */
export function isExpiredInstant(
  iso: string | null | undefined,
  now: Date | number = Date.now(),
): boolean {
  if (!iso) return false; // 만료 시각이 없으면 만료가 아니다
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const ms = typeof now === "number" ? now : now.getTime();
  return t <= ms;
}
