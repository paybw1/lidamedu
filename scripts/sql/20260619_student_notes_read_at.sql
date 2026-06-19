-- feat-7-025 B-1: 상담 코멘트 읽음 표시.
-- 각 student_notes 행은 수신자(student_id)가 1명이므로 행 단위 read_at 로 충분(별도 테이블 불필요).
-- 공유(share_with_student) 코멘트를 학생이 /me/consult 에서 처음 열람하면 read_at 기록(adminClient).
-- 기존 행은 NULL(미열람) — 백필하지 않는다(과거 열람 여부를 알 수 없으므로 정직하게 미열람 처리).
-- RLS 변경 없음: read_at 갱신은 service_role 로만(학생은 student_notes_student_read = SELECT 만 가능).
alter table public.student_notes
  add column if not exists read_at timestamptz;

comment on column public.student_notes.read_at is
  '학생이 공유 코멘트를 처음 열람한 시각(NULL=미열람). staff_only 는 공유 전이므로 항상 NULL.';
