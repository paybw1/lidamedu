-- feat-7-049 본문 찾아 고치기 — 변경 로그 + 검색 RPC
--
-- ★before/after 를 jsonb 로 둔다. book_sections·summary_items 는 jsonb 라
--   text 로 눌러 담으면 되돌릴 때 다시 파싱해야 하고, 캐스팅이 어긋나면 조용히 깨진다.

create table if not exists public.content_edit_logs (
  log_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  entity_type text not null check (
    entity_type in ('case', 'case_placement', 'case_reference', 'problem')
  ),
  entity_id uuid not null,
  field text not null,
  before_value jsonb not null,
  after_value jsonb not null,
  search_term text not null,
  replace_term text not null,
  occurrences integer not null default 1,
  created_by uuid references public.profiles(profile_id),
  created_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references public.profiles(profile_id)
);

create index if not exists content_edit_logs_batch_idx
  on public.content_edit_logs (batch_id);
create index if not exists content_edit_logs_created_idx
  on public.content_edit_logs (created_at desc);
create index if not exists content_edit_logs_entity_idx
  on public.content_edit_logs (entity_type, entity_id);

alter table public.content_edit_logs enable row level security;

-- staff(instructor·admin) 만. 쓰기도 요청 클라이언트로 하므로 insert/update 를 연다.
drop policy if exists content_edit_logs_staff_read on public.content_edit_logs;
create policy content_edit_logs_staff_read on public.content_edit_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.profile_id = auth.uid() and p.role in ('instructor', 'admin')
    )
  );

drop policy if exists content_edit_logs_staff_write on public.content_edit_logs;
create policy content_edit_logs_staff_write on public.content_edit_logs
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.profile_id = auth.uid() and p.role in ('instructor', 'admin')
    )
  );

drop policy if exists content_edit_logs_staff_update on public.content_edit_logs;
create policy content_edit_logs_staff_update on public.content_edit_logs
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.profile_id = auth.uid() and p.role in ('instructor', 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.profile_id = auth.uid() and p.role in ('instructor', 'admin')
    )
  );

-- ── 검색 ────────────────────────────────────────────────────────────────────
-- ★jsonb 본문을 앱으로 끌어와 훑으면 안 된다 — book_sections 는 1000행만 받아도
--   fetch 가 끊긴다(실측). 스캔은 DB 안에서 끝내고 (종류·id·필드)만 돌려준다.
-- ★strpos 를 쓴다. like '%'||term||'%' 는 검색어의 % _ 를 이스케이프해야 한다.
--   strpos 는 문자열 그대로 찾는다(대소문자 구분).
create or replace function public.find_content_matches(p_term text, p_limit integer default 200)
returns table (entity_type text, entity_id uuid, field text)
language sql
stable
security invoker
set search_path = public
as $$
  with hits as (
    select 'case'::text as entity_type, c.case_id as entity_id, f.field, f.pos
    from public.cases c
    cross join lateral (values
      ('summary_title', strpos(coalesce(c.summary_title, ''), p_term)),
      ('summary_body_md', strpos(coalesce(c.summary_body_md, ''), p_term)),
      ('reasoning_md', strpos(coalesce(c.reasoning_md, ''), p_term)),
      ('comment_body_md', strpos(coalesce(c.comment_body_md, ''), p_term)),
      ('related_md', strpos(coalesce(c.related_md, ''), p_term)),
      ('summary_items', strpos(coalesce(c.summary_items::text, ''), p_term)),
      ('book_sections', strpos(coalesce(c.book_sections::text, ''), p_term))
    ) as f(field, pos)
    where c.deleted_at is null and f.pos > 0

    union all
    -- 대표 배치의 book_sections 는 cases 의 사본이라 뺀다(같은 자리가 두 번 잡힌다).
    select 'case_placement', l.link_id, 'book_sections', strpos(coalesce(l.book_sections::text, ''), p_term)
    from public.case_systematic_links l
    where l.is_primary = false and strpos(coalesce(l.book_sections::text, ''), p_term) > 0

    union all
    select 'case_reference', r.reference_id, f.field, f.pos
    from public.case_references r
    cross join lateral (values
      ('title', strpos(coalesce(r.title, ''), p_term)),
      ('authors', strpos(coalesce(r.authors, ''), p_term)),
      ('source', strpos(coalesce(r.source, ''), p_term)),
      ('note', strpos(coalesce(r.note, ''), p_term))
    ) as f(field, pos)
    where f.pos > 0

    union all
    select 'problem', p.problem_id, 'explanation_md', strpos(coalesce(p.explanation_md, ''), p_term)
    from public.problems p
    where p.deleted_at is null and strpos(coalesce(p.explanation_md, ''), p_term) > 0
  )
  select h.entity_type, h.entity_id, h.field
  from hits h
  order by h.entity_type, h.entity_id, h.field
  limit greatest(1, least(p_limit, 500));
$$;

revoke all on function public.find_content_matches(text, integer) from public;
grant execute on function public.find_content_matches(text, integer) to authenticated;
