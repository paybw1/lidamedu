-- 오류신고 완료 시 신고자 인박스 알림 kind.
alter type public.staff_notification_kind add value if not exists 'bug_report_resolved';
