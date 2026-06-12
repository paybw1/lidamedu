-- feat-4-A-340 문제(객관식) 체계도 소분류 배치.
-- 판례(cases.primary_node_id)와 동일 모델을 문제에 도입.
-- NULL = primary_article_id 파생 배치(하위호환). 값 있으면 그 노드에만 배치.
alter table public.problems
  add column if not exists primary_node_id uuid
    references public.systematic_nodes(node_id) on delete set null;

create index if not exists idx_problems_primary_node_id
  on public.problems(primary_node_id);

comment on column public.problems.primary_node_id is
  '체계도 소분류 단일 배치(feat-4-A-340). NULL=primary_article_id 파생. 값 있으면 그 노드에만. systematic_nodes(node_id) FK, on delete set null.';
