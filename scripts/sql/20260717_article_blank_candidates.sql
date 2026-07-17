-- feat-2-029 후속 — 조문 빈칸 후보(승인 대기 큐). 조문에 매핑된 OX 거짓(X) 지문에서
--   AI가 함정 키워드를 조문 원문 verbatim 으로 도출. case_blank_candidates 미러.
--   승인 시 승인자 '내 세트'(article_blank_sets)에 addBlankToSet 로 기록.
create table if not exists public.article_blank_candidates (
  candidate_id   uuid primary key default gen_random_uuid(),
  article_id     uuid not null references public.articles(article_id) on delete cascade,
  law_code       text not null,
  answer         text not null,             -- 빈칸 정답(조문 원문 substring)
  before_context text,                      -- ±80자 hint (addBlankToSet beforeHint/afterHint 로 전달)
  after_context  text,
  source_ref_type text,                     -- 'choice' | 'box'
  source_ref_id   uuid,
  source_problem_id uuid,
  source_display_no int,                    -- P-{n}
  false_statement text,                     -- 함정(거짓) 지문 — 운영자 검토용
  rationale      text,                      -- AI 근거
  status         text not null default 'pending',  -- pending | approved | rejected
  -- 승인 결과 좌표 — 되돌리기 시 세트에서 해당 blank 를 정확히 제거하기 위함.
  approved_set_id uuid,
  approved_blank_idx int,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.profiles(profile_id)
);

create index if not exists article_blank_candidates_article_idx on public.article_blank_candidates(article_id);
create index if not exists article_blank_candidates_status_idx on public.article_blank_candidates(status);
create index if not exists article_blank_candidates_law_idx on public.article_blank_candidates(law_code);

alter table public.article_blank_candidates enable row level security;

-- 승인 큐 = staff 전용(읽기·쓰기 모두). 학생 미노출.
drop policy if exists article_blank_candidates_staff on public.article_blank_candidates;
create policy article_blank_candidates_staff on public.article_blank_candidates
  for all using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

select
  (select count(*) from public.article_blank_candidates) as rows,
  (select count(*) from pg_policies where tablename='article_blank_candidates') as policies;
