// /study/blanks 는 통합 학습 통계 페이지(feat-2-008)의 빈칸 탭으로 이전됨.
// 외부 즐겨찾기/링크 보존을 위해 라우트는 유지하고 redirect 만 수행한다.

import { redirect } from "react-router";

import type { Route } from "./+types/blanks-stats";

export async function loader(_: Route.LoaderArgs) {
  throw redirect("/study/stats?tab=blanks");
}

export default function BlanksStatsRedirect() {
  return null;
}
