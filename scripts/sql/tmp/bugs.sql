-- 이 단원(행위능력) 서브트리에 배치된 문제의 해설에서 '코드처럼 보이는' 것 찾기
with sub as (
  select node_id from systematic_nodes
  where law_code='patent' and (path::text = 'patent.b1.b3' or path::text like 'patent.b1.b3.%')
)
select p.problem_id, p.display_no, left(p.explanation_md, 400) as 해설
from problems p
where p.primary_node_id in (select node_id from sub)
  and p.deleted_at is null
  and (p.explanation_md like '%<%' or p.explanation_md like '%```%'
       or p.explanation_md like '%&lt;%' or p.explanation_md like '%<br%')
limit 10;
