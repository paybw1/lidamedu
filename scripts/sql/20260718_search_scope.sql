-- 전역 검색 범위 구분 (제목 title / 본문 전체 full) — 커맨드 팔레트 토글용.
--   title: 제목·라벨류만 (조문 표제, 판례 사건번호·사건명·닉네임·요지제목, 문제 발문)
--   full : 본문 전체 (조문 body_text, 판례 요지·판시이유·평석·관련자료, 문제 발문+선지+박스+해설)
-- 기존 2-인자 시그니처는 drop (모호성 방지 — 클라이언트가 항상 search_scope 전달).

drop function if exists search_articles_ranked(text, integer);
drop function if exists search_cases_ranked(text, integer);
drop function if exists search_problems_ranked(text, integer);

create or replace function public.search_articles_ranked(q text, lim integer default 6, search_scope text default 'full')
returns table(article_id uuid, score real)
language sql stable
as $$
  select a.article_id,
    greatest(
      similarity(a.display_label, q),
      case when search_scope = 'full' then
        coalesce(
          (select max(similarity(ar.body_text, q))
           from article_revisions ar
           where ar.revision_id = a.current_revision_id),
          0)
      else 0 end
    ) as score
  from articles a
  where a.deleted_at is null
    and a.article_number is not null
    and (
      a.display_label ilike '%' || q || '%'
      or (search_scope = 'full' and exists (
        select 1 from article_revisions ar
        where ar.revision_id = a.current_revision_id
          and ar.body_text ilike '%' || q || '%'
      ))
    )
  order by score desc nulls last, a.display_label
  limit lim;
$$;

create or replace function public.search_cases_ranked(q text, lim integer default 6, search_scope text default 'full')
returns table(case_id uuid, score real)
language sql stable
as $$
  select c.case_id,
    greatest(
      similarity(coalesce(c.case_title, ''), q),
      similarity(c.case_number, q),
      similarity(coalesce(c.nickname, ''), q),
      similarity(coalesce(c.summary_title, ''), q),
      case when search_scope = 'full' then greatest(
        similarity(coalesce(c.summary_body_md, ''), q) * 0.7,
        similarity(coalesce(c.reasoning_md, ''), q) * 0.6,
        similarity(coalesce(c.comment_body_md, ''), q) * 0.6,
        similarity(coalesce(c.related_md, ''), q) * 0.5
      ) else 0 end
    ) as score
  from cases c
  where c.deleted_at is null
    and (
      c.case_number ilike '%' || q || '%'
      or c.case_title ilike '%' || q || '%'
      or c.nickname ilike '%' || q || '%'
      or c.summary_title ilike '%' || q || '%'
      or (search_scope = 'full' and (
        c.summary_body_md ilike '%' || q || '%'
        or c.reasoning_md ilike '%' || q || '%'
        or c.comment_body_md ilike '%' || q || '%'
        or c.related_md ilike '%' || q || '%'
      ))
    )
  order by score desc nulls last, c.decided_at desc nulls last
  limit lim;
$$;

create or replace function public.search_problems_ranked(q text, lim integer default 6, search_scope text default 'full')
returns table(problem_id uuid, score real)
language sql stable
as $$
  select p.problem_id,
    greatest(
      similarity(p.body_md, q),
      case when search_scope = 'full' then coalesce(
        (select max(greatest(
            similarity(coalesce(ch.body_md, ''), q),
            similarity(coalesce(ch.explanation_md, ''), q) * 0.8))
         from problem_choices ch where ch.problem_id = p.problem_id), 0)
      else 0 end,
      case when search_scope = 'full' then coalesce(
        (select max(greatest(
            similarity(coalesce(bi.body_md, ''), q),
            similarity(coalesce(bi.explanation_md, ''), q) * 0.8))
         from problem_box_items bi where bi.problem_id = p.problem_id), 0)
      else 0 end,
      case when search_scope = 'full' then similarity(coalesce(p.explanation_md, ''), q) * 0.8 else 0 end
    ) as score
  from problems p
  where p.deleted_at is null
    and p.review_status = 'approved'
    and (
      p.body_md ilike '%' || q || '%'
      or (search_scope = 'full' and (
        p.explanation_md ilike '%' || q || '%'
        or exists (select 1 from problem_choices ch
                   where ch.problem_id = p.problem_id
                     and (ch.body_md ilike '%' || q || '%' or ch.explanation_md ilike '%' || q || '%'))
        or exists (select 1 from problem_box_items bi
                   where bi.problem_id = p.problem_id
                     and (bi.body_md ilike '%' || q || '%' or bi.explanation_md ilike '%' || q || '%'))
      ))
    )
  order by score desc nulls last, p.year desc nulls last
  limit lim;
$$;
