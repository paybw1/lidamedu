-- feat-8-030 dunning — 학생 알림 kind 2종 추가(결제 실패 / 구독 만료 회수 실패).
-- ADD VALUE 는 사용 문장과 같은 트랜잭션에 두지 않도록 별도 파일로 실행.
alter type public.staff_notification_kind add value if not exists 'payment_failed';
alter type public.staff_notification_kind add value if not exists 'subscription_lapsed';
