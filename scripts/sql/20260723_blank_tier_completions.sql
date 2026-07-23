-- feat-2-030 — 조문 빈칸 난이도 계층 통과 기록. 게이트·게임화 파생 소스.
create table if not exists public.blank_tier_completions (
  completion_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  set_id uuid not null references public.article_blank_sets (set_id) on delete cascade,
  tier smallint not null check (tier between 1 and 3),
  completed_at timestamptz not null default now(),
  unique (user_id, set_id, tier)
);

create index if not exists blank_tier_completions_user_set_idx
  on public.blank_tier_completions (user_id, set_id);

alter table public.blank_tier_completions enable row level security;

-- 본인 것만 R/W (서버 API 가 정답 재검증 후 self-client 로 기록).
drop policy if exists blank_tier_completions_self_read on public.blank_tier_completions;
create policy blank_tier_completions_self_read
  on public.blank_tier_completions for select
  using (auth.uid() = user_id);

drop policy if exists blank_tier_completions_self_insert on public.blank_tier_completions;
create policy blank_tier_completions_self_insert
  on public.blank_tier_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists blank_tier_completions_self_delete on public.blank_tier_completions;
create policy blank_tier_completions_self_delete
  on public.blank_tier_completions for delete
  using (auth.uid() = user_id);
