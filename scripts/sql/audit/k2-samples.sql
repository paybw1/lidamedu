select title, audience_kind, platform_scope, is_pinned,
       published_at is not null as published, left(body_md, 80) as head
  from public.announcements where deleted_at is null
 order by created_at desc limit 5;
