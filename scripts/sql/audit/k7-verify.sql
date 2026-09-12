select 'announcement' as kind, title,
       audience_kind::text as aud, platform_scope::text as scope,
       is_pinned::text as pinned, (published_at is not null)::text as published,
       length(body_md) as len
  from public.announcements
 where title like '상표법%조문을 열었습니다%' and deleted_at is null
union all
select 'guide', title, audience, category, display_order::text, is_published::text, length(body_md)
  from public.guide_articles where title like '상표법%지금은 조문부터%';
