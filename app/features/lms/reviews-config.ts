// 수강 후기 보상 정책 — 클라이언트·서버 공용 상수(*.server 아님 — UI/컴포넌트 import 안전).
//   일정 분량 이상 강의(plan) 후기를 작성하면 포인트를 적립한다(대상당 1회, 재작성 어뷰즈 방지).
//   ★지급 포인트는 운영관리(app_settings review_reward_points, getReviewRewardPoints)에서 조정.
//     기본값 = REVIEW_REWARD_POINTS_DEFAULT(app-settings.server).

/** 보상 지급 최소 본문 글자 수(공백 제외 trim 길이 기준). */
export const REVIEW_REWARD_MIN_CHARS = 100;

// 수강 후기 기능 노출 스위치 — 일단 숨김(원장 결정 2026-07-27, 필요 시 true 로 오픈).
//   student 표면(내 강의 작성 CTA·상품/교재 상세 후기 섹션·강의 랜딩 수강생 후기 섹션·
//   운영자 리뷰 관리 nav)을 이 한 곳으로 게이트한다. 라우트·액션·데이터는 유지 → 재오픈은 true.
export const REVIEWS_ENABLED = false;
