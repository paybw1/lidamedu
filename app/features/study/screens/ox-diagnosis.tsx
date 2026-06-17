// feat-2-022 — OX 약점 진단은 "학습 통계 > 정오문제 약점" 탭으로 흡수(통폐합).
// 라우트는 보존(기존 링크·북마크 무효화 방지)하되 통계 탭으로 리다이렉트한다.
// 진단 표현은 통계 탭이 공용 <OxDiagnosisView audience="self"> 로 그대로 렌더.
// (강사 드릴다운 /admin/students/:id 는 같은 공용 뷰를 별도 경로로 쓰므로 무관.)
import { redirect } from "react-router";

import type { Route } from "./+types/ox-diagnosis";

export function loader(_: Route.LoaderArgs) {
  return redirect("/study/stats?tab=ox_diagnosis");
}
