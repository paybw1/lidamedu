select pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.enrollments'::regclass and contype = 'c'
union all
select 'DISTINCT: ' || string_agg(distinct status, ',') from enrollments;
