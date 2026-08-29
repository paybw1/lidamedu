-- 전역 검색(⌘K)에 도해특허법 유닛을 포함 — search_cases_ranked 와 같은 꼴.
--
-- ★SECURITY INVOKER(기본) — dohae_units 의 RLS(로그인 사용자만 SELECT)가 그대로 걸린다.
--   비로그인 방문자에게는 0건이 나가야 한다(도해는 유출방지 대상 콘텐츠).
-- ★본문은 blocks(jsonb) 안에 있다. 앱에서 훑으면 94유닛×큰 jsonb 를 다 받아야 하므로
--   DB 안에서 blocks::text 로 훑는다.
create or replace function public.search_dohae_units(
  q text,
  lim integer default 6,
  search_scope text default 'full'
)
returns table (unit_id uuid, score real)
language sql
stable
as $$
  select u.unit_id,
    greatest(
      similarity(coalesce(u.title, ''), q),
      similarity(coalesce(u.chapter_title, ''), q),
      case when search_scope = 'full'
        then similarity(coalesce(u.blocks::text, ''), q) * 0.6
        else 0 end
    ) as score
  from public.dohae_units u
  where (
    u.title ilike '%' || q || '%'
    or u.chapter_title ilike '%' || q || '%'
    or (search_scope = 'full' and u.blocks::text ilike '%' || q || '%')
  )
  order by score desc nulls last, u.chapter_no, u.unit_no nulls last
  limit lim;
$$;

revoke all on function public.search_dohae_units(text, integer, text) from public;
grant execute on function public.search_dohae_units(text, integer, text) to anon, authenticated;
