select pr.problem_number as no, pr.display_no,
       left(regexp_replace(pr.body_md,'\s+',' ','g'), 52) as 발문
  from public.problems pr
  left join public.systematic_nodes n on n.node_id = pr.primary_node_id
 where pr.source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67' and pr.deleted_at is null
   and n.display_label like '정정심판%'
 order by pr.problem_number;
