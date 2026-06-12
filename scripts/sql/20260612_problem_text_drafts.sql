-- 자연과학 기출 이미지지문 → 텍스트 변환 staging.
-- 순수텍스트 문제: stem_md(발문) + choices(선지 텍스트) → 이미지 제거.
-- 도표 문제: recrop_path(선지행 잘라낸 도표 이미지) 를 body 로, choices 만 텍스트화.
-- 승인 전까지 운영 problems.body_md / problem_choices.body_md 무변경(게이트).

create table if not exists public.problem_text_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(problem_id) on delete cascade,
  stem_md text not null,                 -- 발문 markdown (도표문제도 검색/참조용 보존)
  choices jsonb not null,                -- 선지 텍스트 배열 (choice_index 1..5 순서)
  has_figure boolean not null default false,
  choice_top_frac real,                  -- 재크롭 경계 y비율 (도표문제, null=순수텍스트)
  recrop_path text,                      -- 재크롭 업로드 스토리지 경로 (도표문제)
  status public.explanation_draft_status not null default 'pending',
  model text,
  note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(profile_id),
  constraint problem_text_drafts_problem_uniq unique (problem_id)
);

create index if not exists problem_text_drafts_status_idx
  on public.problem_text_drafts (status);

alter table public.problem_text_drafts enable row level security;

drop policy if exists "staff-read-text-drafts" on public.problem_text_drafts;
create policy "staff-read-text-drafts" on public.problem_text_drafts
  for select using (private.is_staff(auth.uid()));

drop policy if exists "staff-write-text-drafts" on public.problem_text_drafts;
create policy "staff-write-text-drafts" on public.problem_text_drafts
  for all using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

-- 승인 RPC: 도표문제는 재크롭 이미지, 순수텍스트는 발문 텍스트를 body 로.
-- 선지(choice_index 1..5)는 choices jsonb(0..4) 텍스트로 채운다. 원자적, staff 전용.
create or replace function public.approve_text_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_problem uuid;
  v_stem text;
  v_choices jsonb;
  v_has_figure boolean;
  v_recrop text;
  v_body text;
  i int;
begin
  if not private.is_staff(auth.uid()) then
    raise exception 'not staff';
  end if;
  select problem_id, stem_md, choices, has_figure, recrop_path
    into v_problem, v_stem, v_choices, v_has_figure, v_recrop
    from public.problem_text_drafts
    where draft_id = p_draft_id and status <> 'approved';
  if v_problem is null then
    raise exception 'draft not found or already approved';
  end if;

  if v_has_figure then
    if v_recrop is null then
      raise exception 'figure draft missing recrop_path';
    end if;
    v_body := '![](' || v_recrop || ')';   -- 재크롭 이미지(발문+도표, 선지 제외)
  else
    v_body := v_stem;                        -- 순수 텍스트 발문
  end if;

  update public.problems
    set body_md = v_body, updated_at = now()
    where problem_id = v_problem;

  for i in 0 .. jsonb_array_length(v_choices) - 1 loop
    update public.problem_choices
      set body_md = v_choices ->> i
      where problem_id = v_problem and choice_index = i + 1;
  end loop;

  update public.problem_text_drafts
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where draft_id = p_draft_id;
end;
$$;
