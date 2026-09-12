select (select count(*) from public.profiles) as profiles,
       (select count(*) from public.profiles where role='student') as students,
       (select announcement_id::text from public.announcements
         where title like '상표법%조문을 열었습니다%' and deleted_at is null) as ann_id,
       (select count(*) from public.user_notifications n
         where n.kind='announcement' and n.entity_type='announcement'
           and n.entity_id = (select announcement_id::text from public.announcements
                               where title like '상표법%조문을 열었습니다%' and deleted_at is null)) as already_sent;
