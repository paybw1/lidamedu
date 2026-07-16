-- feat-2-029 S2 — 판례 빈칸 세트(승인된 빈칸 저장소). article_blank_sets 미러.
--   blanks jsonb 원소(문서화, 미강제):
--     { idx:int, target:'summary'|'reasoning'|'comment', itemIndex?:int(=summary_items 항),
--       answer:string, beforeContext?:string, afterContext?:string,
--       sourceOx?:string(근거 OX display_no), blockIndex?:int, cumOffset?:int }
--   요지(summary_items[itemIndex].body) + 판시이유(reasoning) + 평석(comment) cloze 지원(결정 #1).
--   ★노출은 UI(isStaff) 게이트로 통제 — feat-2-029 완성 전 수험생 미노출. 표는 비어 있음.

create table if not exists public.case_blank_sets (
  set_id       uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(case_id) on delete cascade,
  owner_id     uuid references public.profiles(profile_id),
  version      text not null default 'v1',
  display_name text,
  importance   int  not null default 1,
  blanks       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists case_blank_sets_case_idx on public.case_blank_sets(case_id);

alter table public.case_blank_sets enable row level security;

-- 콘텐츠 읽기: 공개(학습 데이터). 노출 차단은 UI(isStaff) 게이트가 담당(표는 미완성 동안 비어 있음).
drop policy if exists case_blank_sets_select_all on public.case_blank_sets;
create policy case_blank_sets_select_all on public.case_blank_sets
  for select using (true);

-- 쓰기: staff 전용.
drop policy if exists case_blank_sets_write_staff on public.case_blank_sets;
create policy case_blank_sets_write_staff on public.case_blank_sets
  for all using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- 적용 확인(마지막 statement = run-prod-sql 반환값).
select
  (select count(*) from public.case_blank_sets) as rows,
  (select count(*) from pg_policies where tablename='case_blank_sets') as policies;
