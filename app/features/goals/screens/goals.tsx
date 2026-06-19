// 학습 목표·진도는 학습 통계(/study/stats)로 통합(통폐합 3a).
// /goals 는 redirect 만 유지 — 북마크·외부 링크·추천 ctaUrl 보존.
// 목표 폼은 /study/stats 상단 "목표 설정" Sheet 로, 진척·합격자 보정은 통계 화면으로 이관됨.
import { redirect } from "react-router";

export function loader() {
  throw redirect("/study/stats");
}

export default function GoalsRedirect() {
  return null;
}
