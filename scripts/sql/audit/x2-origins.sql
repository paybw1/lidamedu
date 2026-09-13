select origin::text as origin, count(*) as n,
       count(*) filter (where explanation_md is not null) as 해설있음
  from public.problems
 where source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67' and deleted_at is null
 group by 1 order by 2 desc;
