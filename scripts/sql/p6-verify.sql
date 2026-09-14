-- P6 적용 후 대조용 — 판정 입력값을 그대로 뽑는다(읽기 전용).
select e.enrollment_id, cl.lesson_id, cl.lesson_no,
       c.max_plays,
       coalesce(lv.duration_seconds,0) as dur,
       coalesce((select sum(wl.seconds) from watch_ledger wl
                 where wl.enrollment_id = e.enrollment_id
                   and wl.lesson_id = cl.lesson_id),0) as used,
       -- DB 가 계산한 정답
       (c.max_plays is not null and coalesce(lv.duration_seconds,0) > 0
        and coalesce((select sum(wl.seconds) from watch_ledger wl
                      where wl.enrollment_id = e.enrollment_id
                        and wl.lesson_id = cl.lesson_id),0)
            >= c.max_plays * coalesce(lv.duration_seconds,0)) as db_exhausted
from enrollments e
join courses c on c.course_id = e.course_id
join course_lessons cl on cl.course_id = c.course_id
     and cl.is_published and cl.deleted_at is null
left join lesson_videos lv on lv.lesson_id = cl.lesson_id and lv.is_active
where e.status = 'active' and e.revoked_at is null
order by cl.lesson_no;
