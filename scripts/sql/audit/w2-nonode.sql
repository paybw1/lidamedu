select pr.display_no, pr.problem_number as no,
       left(regexp_replace(pr.body_md,'\s+',' ','g'), 60) as 발문
  from public.problems pr
 where pr.source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67' and pr.deleted_at is null
   and pr.primary_node_id is null order by pr.display_no;
