-- feat-2-029 S4 — 판례 빈칸 후보(승인 대기 큐). OX 거짓 지문에서 AI가 함정 키워드 도출.
--   staff 전용(내부 큐 — 학생 미노출). 승인(S5) 시 case_blank_sets 로 이관.
create table if not exists public.case_blank_candidates (
  candidate_id   uuid primary key default gen_random_uuid(),
  case_id        uuid not null references public.cases(case_id) on delete cascade,
  target         text not null,            -- 'summary' | 'reasoning' | 'comment'
  item_index     int,                      -- summary 항 번호(0-based)
  answer         text not null,            -- 빈칸 정답(요지/판시 원문 substring)
  before_context text,
  after_context  text,
  cum_offset     int,
  source_ref_type text,                    -- 'choice' | 'box'
  source_ref_id   uuid,
  source_problem_id uuid,
  source_display_no int,                   -- P-{n}
  false_statement text,                    -- 함정(거짓) 지문 — 운영자 검토용
  rationale      text,                     -- AI 근거(무엇을 바꿔 거짓이 됐나)
  status         text not null default 'pending',  -- pending | approved | rejected
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles(profile_id)
);

create index if not exists case_blank_candidates_case_idx on public.case_blank_candidates(case_id);
create index if not exists case_blank_candidates_status_idx on public.case_blank_candidates(status);

alter table public.case_blank_candidates enable row level security;

-- 승인 큐 = staff 전용(읽기·쓰기 모두). 학생 미노출.
drop policy if exists case_blank_candidates_staff on public.case_blank_candidates;
create policy case_blank_candidates_staff on public.case_blank_candidates
  for all using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

select
  (select count(*) from public.case_blank_candidates) as rows,
  (select count(*) from pg_policies where tablename='case_blank_candidates') as policies;
