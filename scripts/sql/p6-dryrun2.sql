-- ★핵심: 판정 단일화 후 「새로 잠길」 슬롯 = 수강권 × 회차 중 원장합 >= max_plays × 길이
with slots as (
  select e.enrollment_id, e.user_id, c.course_id, c.max_plays,
         cl.lesson_id, cl.lesson_no, cl.title,
         coalesce(lv.duration_seconds, 0) as dur,
         coalesce((select sum(wl.seconds) from watch_ledger wl
                   where wl.enrollment_id = e.enrollment_id
                     and wl.lesson_id = cl.lesson_id), 0) as used
  from enrollments e
  join courses c on c.course_id = e.course_id
  join course_lessons cl on cl.course_id = c.course_id
       and cl.is_published and cl.deleted_at is null
  left join lesson_videos lv on lv.lesson_id = cl.lesson_id and lv.is_active
  where e.status = 'active' and e.revoked_at is null
)
select 'SLOTS_total' as k, count(*)::text as v from slots
union all
select 'SLOTS_would_lock', count(*)::text from slots
  where max_plays is not null and dur > 0 and used >= max_plays * dur
union all
select 'SLOTS_used_gt_zero', count(*)::text from slots where used > 0
union all
select 'SLOTS_no_duration', count(*)::text from slots where dur = 0
union all
select 'SLOTS_detail_used',
       string_agg(lesson_no || '강 used=' || used || ' cap=' || (max_plays*dur), ' | ')
  from slots where used > 0
union all
-- course_lessons.max_plays 값 분포(죽은 컬럼이 실제로 쓰이는지)
select 'LESSON_MAXPLAYS_vals',
       string_agg(distinct max_plays::text, ',') from course_lessons where max_plays is not null
union all
select 'COURSE_MAXPLAYS_vals',
       string_agg(distinct max_plays::text, ',') from courses where max_plays is not null
union all
-- 6시간 창 안 grant 중 소진 슬롯(가드가 곧 스킵할 하트비트)
select 'GRANTS_recent_6h', count(*)::text from playback_grants
  where granted_at > now() - interval '6 hours';
