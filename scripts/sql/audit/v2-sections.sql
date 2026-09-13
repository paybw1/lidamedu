select pn.display_label as parent, n.display_label as node,
       count(*) as 문항, min(pr.problem_number) as n_min, max(pr.problem_number) as n_max,
       count(*) filter (where length(coalesce(pr.explanation_md,'')) >= 100) as 해설있음
  from public.problems pr
  left join public.systematic_nodes n on n.node_id = pr.primary_node_id
  left join public.systematic_nodes pn on pn.node_id = n.parent_id
 where pr.source_doc_id = '1b7a79f1-a6e2-49a7-ada1-815032c9da67' and pr.deleted_at is null
 group by 1,2 order by min(pr.display_no);
