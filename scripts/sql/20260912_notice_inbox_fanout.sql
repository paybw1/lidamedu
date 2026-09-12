-- 상표·디자인 조문 공개 공지 → 인박스 알림 팬아웃(원장 지시 2026-09-12).
--
-- 이 공지는 SQL 로 직접 넣어 /admin 발행 액션을 안 탔다. 그래서
-- notifyAnnouncementPublished() 가 호출되지 않아 알림이 0건이었다.
-- 같은 함수와 **같은 모양**으로 채운다(kind=announcement · entity_type=announcement
-- · entity_id=announcement_id · href=/announcements — platform_scope 가 study 라서).
--
-- ★멱등 — entity_id 로 기존 알림을 보고 없을 때만 넣는다(함수와 같은 규약).
-- ★본문 미리보기는 notify.server.ts 의 stripMarkdown() 을 그대로 옮겼다.
--   이미지형 공지라 걷어내지 않으면 알림 카드에 URL 이 그대로 찍힌다.

with ann as (
  select announcement_id, title, body_md
    from public.announcements
   where title = '상표법·디자인보호법 조문을 열었습니다 — 판례·문제는 준비 중'
     and deleted_at is null
     and published_at is not null
),
prev as (
  select a.announcement_id, a.title,
         nullif(btrim(regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(a.body_md, '!\[[^\]]*\]\([^)]*\)', ' ', 'g'),  -- 이미지 제거
               '\[([^\]]*)\]\([^)]*\)', '\1', 'g'),                          -- 링크는 글자만
             '\*\*|__|\*|`', '', 'g'),                                       -- 강조 기호
           '\s+', ' ', 'g')), '') as flat
    from ann a
),
body as (
  select announcement_id, title,
         case when length(flat) > 120 then left(flat, 120) || '…' else flat end as body
    from prev
)
insert into public.user_notifications
  (recipient_id, kind, entity_type, entity_id, title, body, href)
select p.profile_id, 'announcement', 'announcement',
       b.announcement_id::text, b.title, b.body, '/announcements'
  from public.profiles p cross join body b
 where not exists (
   select 1 from public.user_notifications n
    where n.kind = 'announcement'
      and n.entity_type = 'announcement'
      and n.entity_id = b.announcement_id::text
 );
