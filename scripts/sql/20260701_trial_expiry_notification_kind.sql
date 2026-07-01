-- feat-8-027 Stage 3 — 체험 만료 임박 인박스 알림 종류.
alter type public.staff_notification_kind
  add value if not exists 'trial_expiry_warning';
