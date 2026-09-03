// feat-11-011 P4 — 목록 상태 유지. 요청서 §1.4·§5:
//   "목록 필터·정렬·화면크기·검색어는 상세 화면을 보고 돌아와도 유지합니다."
//
// ★SSOT 는 URL 쿼리스트링이다. sessionStorage 는 **복원 힌트**일 뿐이다.
//   URL 이 권위여야 링크 공유·새로고침·뒤로가기가 그대로 동작한다.
// ★sessionStorage 를 쓴다(localStorage 아님). 며칠 전 필터가 되살아나 "왜 목록이
//   비었지"가 되는 것보다, 탭을 닫으면 잊는 편이 낫다.

import { useEffect, useState } from "react";
import { useLocation } from "react-router";

const PREFIX = "adminList:";

function keyOf(listPath: string): string {
  return PREFIX + listPath;
}

/**
 * 지금 화면의 쿼리스트링을 그 경로의 마지막 상태로 기억한다.
 * ★AdminShell 이 한 번 부르면 **모든 운영자 화면**이 적용된다 — 목록 화면 60여 개를
 *   하나씩 고치지 않는다. 상세 화면도 자기 경로로 기억되지만 해가 없다.
 */
export function useRememberCurrentQuery(): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    try {
      window.sessionStorage.setItem(keyOf(pathname), search);
    } catch {
      // sessionStorage 불가 환경(사파리 프라이빗 등) — 유지 없이 동작만 한다.
    }
  }, [pathname, search]);
}

/**
 * 사이드바가 쓸 "경로 → 기억된 쿼리" 표. mount 뒤에 읽는다.
 * ★렌더 중에 sessionStorage 를 읽으면 서버·클라이언트 결과가 달라져 hydration 이 깨진다.
 */
export function useRememberedQueries(paths: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.join("\n");
  useEffect(() => {
    const next: Record<string, string> = {};
    try {
      for (const p of key.split("\n")) {
        if (!p || p.includes("?")) continue; // 쿼리가 박힌 메뉴는 그대로 둔다
        const saved = window.sessionStorage.getItem(keyOf(p));
        if (saved) next[p] = saved;
      }
    } catch {
      return;
    }
    setMap(next);
  }, [key]);
  return map;
}

/** 기억해 둔 쿼리스트링을 붙인 목록 경로. 기억이 없으면 경로만 돌려준다. */
export function listReturnHref(listPath: string): string {
  try {
    const saved = window.sessionStorage.getItem(keyOf(listPath));
    return saved ? listPath + saved : listPath;
  } catch {
    return listPath;
  }
}
