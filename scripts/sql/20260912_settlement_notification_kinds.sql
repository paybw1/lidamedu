-- feat-8-031 — 정산 확정·지급 알림 kind. (enum 추가는 단독 파일: 같은 트랜잭션에서 새 값을 쓸 수 없다)
alter type public.staff_notification_kind add value if not exists 'settlement_confirmed';
alter type public.staff_notification_kind add value if not exists 'settlement_paid';
