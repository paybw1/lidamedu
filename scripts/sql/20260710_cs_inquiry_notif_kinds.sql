-- feat-6-011 고객센터 문의 알림 kind — staff_notification_kind enum 확장.
-- cs_inquiry_created(staff: 새 문의 접수) / cs_inquiry_answered(student: 답변 등록).
alter type staff_notification_kind add value if not exists 'cs_inquiry_created';
alter type staff_notification_kind add value if not exists 'cs_inquiry_answered';
