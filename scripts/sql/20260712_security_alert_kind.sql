-- 감사 이상 실시간 알림 — staff 보안 경보 알림 kind.
alter type public.staff_notification_kind add value if not exists 'security_alert';
