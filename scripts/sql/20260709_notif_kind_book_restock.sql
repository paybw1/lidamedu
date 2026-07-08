-- feat-11 B2-4 재입고 알림 — 알림 종류 enum 값 추가(학생 인박스 분류용).
alter type public.staff_notification_kind add value if not exists 'book_restock';
