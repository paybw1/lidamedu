select title, left(body_md, 300) as head
  from public.announcements
 where body_md like '!%[%' and deleted_at is null order by created_at desc limit 3;
