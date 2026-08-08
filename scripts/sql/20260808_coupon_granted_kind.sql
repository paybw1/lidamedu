-- feat-11-008 보완 ② — 쿠폰 개별 발급 시 학생 인박스 알림.
-- ★enum 값 추가는 같은 트랜잭션에서 그 값을 참조할 수 없어 별도 파일로 분리한다.
alter type public.staff_notification_kind add value if not exists 'coupon_granted';
