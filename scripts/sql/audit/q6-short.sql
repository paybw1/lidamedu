-- 너무 짧은 해설 — 컴포넌트가 감당할 하한. 노출본 기준.
select
  count(*) filter (where length(explanation_md) < 20)  as lt20,
  count(*) filter (where length(explanation_md) < 50)  as lt50,
  count(*) filter (where length(explanation_md) < 100) as lt100,
  count(*) as total
from public.problems
where explanation_md is not null and deleted_at is null;
