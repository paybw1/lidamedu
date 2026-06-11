-- feat-3-305 자연과학 기출 AI 해설 — 학생 노출 게이트.
-- 운영 problems.explanation_md 에는 "승인된 해설"만 둔다. AI 초안은 이 테이블에 stage 하고
-- 스태프 승인 시 approve_explanation_draft RPC 로 explanation_md 에 복사한다.
-- 순수 추가형(기존 테이블/데이터 무변경). 적용: Supabase Management API (mcgdoplo).

-- 초안 상태 enum
do $$ begin
  if not exists (select 1 from pg_type where typname = 'explanation_draft_status') then
    create type public.explanation_draft_status as enum ('pending', 'approved', 'rejected');
  end if;
end $$;

-- 초안 테이블 (문제당 1행, 재생성 시 upsert)
create table if not exists public.problem_explanation_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(problem_id) on delete cascade,
  content_md text not null,
  ai_answer text,                      -- AI 가 도출한 정답 표기(예: '①')
  answer_match boolean,                -- AI 답 == 정답키 여부 (검수 우선순위)
  model text,                          -- 생성 모델 식별자
  status public.explanation_draft_status not null default 'pending',
  note text,                           -- 검수 메모 / 생성 플래그 사유
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(profile_id),
  constraint problem_explanation_drafts_problem_uniq unique (problem_id)
);

create index if not exists problem_explanation_drafts_status_idx
  on public.problem_explanation_drafts (status);

-- RLS: 스태프(instructor/manager/admin) 전용. 학생 접근 없음(초안은 내부 검수물).
alter table public.problem_explanation_drafts enable row level security;

drop policy if exists "staff-read-expl-drafts" on public.problem_explanation_drafts;
create policy "staff-read-expl-drafts" on public.problem_explanation_drafts
  for select using (private.is_staff(auth.uid()));

drop policy if exists "staff-write-expl-drafts" on public.problem_explanation_drafts;
create policy "staff-write-expl-drafts" on public.problem_explanation_drafts
  for all using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

-- 승인 RPC: 초안 본문을 problems.explanation_md 로 원자적 복사 + 상태 갱신.
create or replace function public.approve_explanation_draft(p_draft_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_problem uuid;
  v_md text;
begin
  if not private.is_staff(auth.uid()) then
    raise exception 'not staff';
  end if;
  select problem_id, content_md into v_problem, v_md
    from public.problem_explanation_drafts
    where draft_id = p_draft_id and status <> 'approved';
  if v_problem is null then
    raise exception 'draft not found or already approved';
  end if;
  update public.problems
    set explanation_md = v_md, updated_at = now()
    where problem_id = v_problem;
  update public.problem_explanation_drafts
    set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
    where draft_id = p_draft_id;
end;
$$;
