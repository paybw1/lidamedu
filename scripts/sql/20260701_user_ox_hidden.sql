-- feat: 학생 개인별 정오문제 숨김 (per-user OX hide)
-- staff 전체 숨김(problem_choices.ox_hidden_at)과 별개. 학생이 숨기면 본인만 안 보임.
-- unhide = row 삭제(선호 토글이라 soft-delete 불필요).

create table if not exists public.user_ox_hidden (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('problem_choice', 'problem_box_item')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, target_type, target_id)
);

alter table public.user_ox_hidden enable row level security;

-- 본인 행만 R/W/D.
drop policy if exists user_ox_hidden_select_own on public.user_ox_hidden;
create policy user_ox_hidden_select_own on public.user_ox_hidden
  for select using (auth.uid() = user_id);

drop policy if exists user_ox_hidden_insert_own on public.user_ox_hidden;
create policy user_ox_hidden_insert_own on public.user_ox_hidden
  for insert with check (auth.uid() = user_id);

drop policy if exists user_ox_hidden_delete_own on public.user_ox_hidden;
create policy user_ox_hidden_delete_own on public.user_ox_hidden
  for delete using (auth.uid() = user_id);

-- 지문별 숨김자 역조회(운영 통계용) 대비 보조 인덱스.
create index if not exists user_ox_hidden_target_idx
  on public.user_ox_hidden (target_type, target_id);
