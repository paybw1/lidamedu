-- 문제편 소속 592문항의 매칭 키 후보.
select pr.display_no, pr.problem_number, pr.exam_number,
       n.display_label as node, pn.display_label as parent,
       length(coalesce(pr.explanation_md,'')) as exp_len,
       left(regexp_replace(pr.body_md,'\s+',' ','g'), 45) as 발문
  from public.problems pr
  left join public.systematic_nodes n on n.node_id = pr.primary_node_id
  left join public.systematic_nodes pn on pn.node_id = n.parent_id
 where pr.source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67' and pr.deleted_at is null
 order by pr.display_no limit 12;
