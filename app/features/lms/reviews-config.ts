// 수강 후기 보상 정책 — 클라이언트·서버 공용 상수(*.server 아님 — UI/컴포넌트 import 안전).
//   일정 분량 이상 강의(plan) 후기를 작성하면 포인트를 적립한다(대상당 1회, 재작성 어뷰즈 방지).
//   ★지급 포인트는 운영관리(app_settings review_reward_points, getReviewRewardPoints)에서 조정.
//     기본값 = REVIEW_REWARD_POINTS_DEFAULT(app-settings.server).

/** 보상 지급 최소 본문 글자 수(공백 제외 trim 길이 기준). */
export const REVIEW_REWARD_MIN_CHARS = 100;
