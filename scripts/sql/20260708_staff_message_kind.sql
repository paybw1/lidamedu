-- 강사 → 학생 쪽지(인박스) 알림 kind
ALTER TYPE staff_notification_kind ADD VALUE IF NOT EXISTS 'staff_message';
