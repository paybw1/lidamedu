-- 운영 업무별 담당자 지정 (관리자 관리) — 스태프 broadcast 알림을 담당자에게만 라우팅.
-- 배정 0명인 duty 는 기존 전체 fanout 폴백(알림 실종 방지) — 리졸버(app/features/admin/lib/duties.server.ts)가 처리.

create table if not exists public.staff_duty_assignments (
  duty text not null check (duty in (
    'upgrade_request',      -- 종합반 등업신청
    'bug_report',           -- 오류신고
    'qna_question',         -- Q&A 신규 질문
    'review_request',       -- 주관식 첨삭 요청
    'ai_usage_alert',       -- GS AI/OCR 일일 한도 도달
    'lecture_abuse_alert'   -- 강의노트 이상 열람 경보
  )),
  profile_id uuid not null references public.profiles (profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (profile_id) on delete set null,
  primary key (duty, profile_id)
);

alter table public.staff_duty_assignments enable row level security;

-- 읽기: 스태프 전원(인박스 라우팅 근거를 강사도 볼 수 있게). 쓰기: admin 만.
drop policy if exists "staff_duty_assignments_select_staff" on public.staff_duty_assignments;
create policy "staff_duty_assignments_select_staff" on public.staff_duty_assignments
  for select using (private.is_staff((select auth.uid())));

drop policy if exists "staff_duty_assignments_write_admin" on public.staff_duty_assignments;
create policy "staff_duty_assignments_write_admin" on public.staff_duty_assignments
  for all
  using (private.get_role() = 'admin')
  with check (private.get_role() = 'admin');

-- 초기 배정 (2026-07-08 원장 지시): 등업신청 = 민경기 + 임병웅, 오류신고 = 임병웅.
insert into public.staff_duty_assignments (duty, profile_id)
values
  ('upgrade_request', 'ffc3b7ac-5e68-42e2-83ef-172ca75a40aa'),
  ('upgrade_request', 'e20ac99a-bfa6-4862-94dd-23c063189463'),
  ('bug_report',      'e20ac99a-bfa6-4862-94dd-23c063189463')
on conflict do nothing;
