-- feat-4-A-342 지문(choice/box_item) 체계도 소분류.
-- 지문이 OX 로 들어갈 때 제29조처럼 세분화된 조문을 산업상/신규성/진보성/확대로 정밀 배치.
-- NULL = 부모 문제 primary_node_id 상속(feat-4-A-341) → 조문 파생 순.
alter table public.problem_choices
  add column if not exists related_node_id uuid
    references public.systematic_nodes(node_id) on delete set null;
alter table public.problem_box_items
  add column if not exists related_node_id uuid
    references public.systematic_nodes(node_id) on delete set null;
create index if not exists idx_problem_choices_related_node_id
  on public.problem_choices(related_node_id);
create index if not exists idx_problem_box_items_related_node_id
  on public.problem_box_items(related_node_id);
comment on column public.problem_choices.related_node_id is
  '지문 체계도 소분류(feat-4-A-342). NULL=문제 primary_node 상속→조문파생. OX 배치 우선순위 1.';
comment on column public.problem_box_items.related_node_id is
  '보기항목 체계도 소분류(feat-4-A-342). NULL=문제 primary_node 상속→조문파생.';
