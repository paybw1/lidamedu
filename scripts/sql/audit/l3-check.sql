select title, is_pinned, (published_at is not null) as published,
       left(body_md, 140) as head, length(body_md) as len
  from public.announcements
 where title like '상표법%조문을 열었습니다%' and deleted_at is null;
