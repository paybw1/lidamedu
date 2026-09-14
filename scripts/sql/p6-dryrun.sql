-- feat-11-012 P6 운영 dry-run (읽기 전용). 공통 게이트 6.
-- ① 죽은 축 확인 — counts_as_play=true 인 grant 수 (기대 0)
select 'A_counts_as_play_true' as probe,
       count(*)::text as v
from playback_grants where counts_as_play = true
union all
select 'A_grants_total', count(*)::text from playback_grants
union all
-- ② 회계 원장 규모
select 'B_ledger_rows', count(*)::text from watch_ledger
union all
select 'B_ledger_debit_rows', count(*)::text from watch_ledger where kind = 'debit'
union all
select 'B_ledger_sum_seconds', coalesce(sum(seconds),0)::text from watch_ledger
union all
-- ③ 수강권 규모
select 'C_enrollments_active', count(*)::text from enrollments where status = 'active'
union all
select 'C_enrollments_paused', count(*)::text from enrollments where status = 'paused'
union all
select 'C_pauses_open', count(*)::text from enrollment_pauses where resumed_at is null
union all
-- ④ 자동 재개 대상 — ends_on 이 지났는데 아직 paused
select 'C_pauses_overdue', count(*)::text
from enrollment_pauses p
join enrollments e on e.enrollment_id = p.enrollment_id
where p.resumed_at is null
  and p.ends_on < (now() at time zone 'Asia/Seoul')::date
  and e.status = 'paused'
union all
-- ⑤ max_plays 설정 분포
select 'D_courses_maxplays_null', count(*)::text from courses where max_plays is null
union all
select 'D_courses_maxplays_set', count(*)::text from courses where max_plays is not null
union all
select 'D_lessons_maxplays_notnull', count(*)::text from course_lessons where max_plays is not null
union all
-- ⑥ watch_positions / watch_events 규모
select 'E_watch_positions', count(*)::text from watch_positions
union all
select 'E_watch_events', count(*)::text from watch_events
union all
select 'E_positions_at_end', count(*)::text
from watch_positions wp
join lesson_videos lv on lv.lesson_id = wp.lesson_id and lv.is_active
where lv.duration_seconds > 0 and wp.position_seconds >= lv.duration_seconds
order by 1;
