-- Q&A 과목별 답변자 지정 (다대다) — 카테고리당 복수 담당자.
-- 카테고리 10종: patent, trademark, design, civil, civil-procedure,
--                physics, chemistry, biology, earth_science, study_method
-- 새 질문이 올라오면 해당 카테고리 담당자에게 이메일/카카오/인앱 알림 fanout.

create table if not exists public.qna_answerer_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  category text not null,
  answerer_id uuid not null references public.profiles(profile_id) on delete cascade,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  unique (category, answerer_id)
);

create index if not exists qna_answerer_assignments_category_idx
  on public.qna_answerer_assignments (category);

alter table public.qna_answerer_assignments enable row level security;

-- 읽기: 전체 staff(담당자 배지·라우팅 조회). 쓰기: 매니저·원장만(운영관리).
drop policy if exists qna_answerers_select_staff on public.qna_answerer_assignments;
create policy qna_answerers_select_staff
  on public.qna_answerer_assignments for select
  using (private.is_staff(auth.uid()));

drop policy if exists qna_answerers_write_manager on public.qna_answerer_assignments;
create policy qna_answerers_write_manager
  on public.qna_answerer_assignments for all
  using (private.is_manager(auth.uid()))
  with check (private.is_manager(auth.uid()));
