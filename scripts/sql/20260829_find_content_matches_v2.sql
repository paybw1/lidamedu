-- feat-7-049 수정 — 대표 배치를 무조건 빼면 안 된다.
--
-- 처음엔 is_primary 를 통째로 뺐다. 대표 배치의 book_sections 가 cases 의 사본이라
-- 같은 자리가 두 번 잡히기 때문이었는데, 실제로는 **대표 배치가 자기 본문을 따로
-- 갖는 경우가 있다**(상표 대표 배치 359건 중 153건). 그것까지 빼면 그 본문은 이 도구로
-- 영영 못 찾는다.
--
-- 바꾼 규칙: 대표 배치라도 **cases 와 다른 본문이면 스캔한다**. 사본일 때만 뺀다
-- (사본은 cases 쪽을 고치면 앱이 같이 미러링한다).
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
    select 'case_placement', l.link_id, 'book_sections',
           strpos(coalesce(l.book_sections::text, ''), p_term)
    from public.case_systematic_links l
    join public.cases c on c.case_id = l.case_id
    where strpos(coalesce(l.book_sections::text, ''), p_term) > 0
      and (l.is_primary = false or l.book_sections is distinct from c.book_sections)

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
    select 'problem', p.problem_id, 'explanation_md',
           strpos(coalesce(p.explanation_md, ''), p_term)
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
