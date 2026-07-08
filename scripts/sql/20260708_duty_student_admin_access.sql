-- 관리자 관리 duty 확장 — 수강생 관리(/admin/users) 화면 접근 권한 (원장 지시 2026-07-08).
-- 알림 라우팅 duty 와 같은 테이블을 쓰되 의미는 접근 권한: 배정된 스태프 + admin 만 접근.

alter table public.staff_duty_assignments
  drop constraint if exists staff_duty_assignments_duty_check;

alter table public.staff_duty_assignments
  add constraint staff_duty_assignments_duty_check check (duty in (
    'upgrade_request',
    'bug_report',
    'qna_question',
    'review_request',
    'ai_usage_alert',
    'lecture_abuse_alert',
    'student_admin_access'   -- 수강생 관리 화면 접근 (admin 은 항상 가능)
  ));
