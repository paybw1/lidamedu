// 목록 페이징 — loader 쪽 헬퍼 (feat-11-012 P7). 서버·클라 공용 순수 모듈.
//
// ★「공용 페이저를 만들면 끝」이 아니다. 상한(.limit)만 걸려 있던 화면은 서버가 애초에
//   페이징을 하지 않으므로, 진짜 비용은 버튼이 아니라 **loader** 에 있다 — 파라미터 파싱,
//   범위 계산, count 요청, 그리고 ★유일 정렬키. 그 네 가지를 여기 모은다.
//
// ★★range 페이징에는 **유일 정렬키가 필수**다. PostgreSQL 은 ORDER BY 없는 LIMIT/OFFSET 의
//   행 순서를 보장하지 않으므로, 정렬이 없거나 정렬키가 겹치면 페이지를 넘길 때 **행이 새거나
//   겹친다.** 같은 함정을 이미 한 번 겪었다(기출 자동 재생성). 이 모듈을 쓰는 쿼리는
//   마지막 .order() 에 반드시 기본키를 넣을 것.

/** 한 페이지에 담는 기본 개수. */
export const PAGE_SIZE = 20;

/** URL 에서 페이지 번호를 읽는다. 없거나 이상하면 1. */
export function parsePage(request: Request, param = "page"): number {
  const raw = new URL(request.url).searchParams.get(param);
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** PostgREST `.range()` 에 넣을 [from, to]. */
export function rangeOf(
  page: number,
  size: number = PAGE_SIZE,
): [number, number] {
  const from = (page - 1) * size;
  return [from, from + size - 1];
}

/** 전체 건수 → 페이지 수. 0건이면 1(빈 목록도 1페이지다). */
export function totalPagesOf(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/**
 * 현재 URL 의 다른 조건(검색어·탭·정렬)을 지키면서 페이지만 바꾼 주소를 만든다.
 *
 * ★페이저가 필터를 떨어뜨리면 「2페이지로 갔더니 검색어가 풀렸다」가 난다 —
 *   13곳이 제각기 만들던 시절 실제로 갈렸던 지점이다.
 */
export function pageUrlMaker(
  currentSearch: string,
  param = "page",
): (page: number) => string {
  return (page: number) => {
    const sp = new URLSearchParams(currentSearch);
    if (page <= 1) sp.delete(param);
    else sp.set(param, String(page));
    const qs = sp.toString();
    return qs ? `?${qs}` : "?";
  };
}
