select count(*) as sent,
       count(*) filter (where read_at is null) as unread,
       (array_agg(title))[1] as title,
       (array_agg(body))[1] as body,
       (array_agg(href))[1] as href
  from public.user_notifications
 where kind='announcement' and entity_type='announcement'
   and entity_id = (select announcement_id::text from public.announcements
                     where title like '상표법%조문을 열었습니다%' and deleted_at is null);
