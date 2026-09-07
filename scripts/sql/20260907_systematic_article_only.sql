-- 체계도 화면별 노출 분리 — 판례 체계도를 조문·객관식 체계도와 독립시킨다.
--
-- 지금까지는 노드 한 벌을 세 화면이 공유하고, 다를 수 있는 건 두 가지뿐이었다.
--   case_only          = 판례 화면에만 보인다
--   case_display_label = 판례 화면에서만 다른 이름
-- 그 반대(조문·객관식에만 보이고 판례에서는 숨긴다)를 표현할 수 없어서,
-- 판례 체계도에 필요 없는 항목을 지우면 조문 체계도에서도 사라졌다.
--
-- article_only 는 case_only 의 짝이다. 두 플래그를 함께 쓰면 한 트리로 두 목차를
-- 만들 수 있다 — 숨긴 노드의 자식은 화면에서 바로 위 보이는 조상으로 끌어올린다
-- (그래서 묶음 층 하나만 한쪽 화면에서 걷어내는 것도 된다).
alter table public.systematic_nodes
  add column if not exists article_only boolean not null default false;

comment on column public.systematic_nodes.article_only is
  '조문·객관식 체계도에만 노출(판례 체계도에서 숨김). case_only 의 짝.';

-- 두 플래그가 동시에 켜지면 어느 화면에도 안 보인다 — 실수 방지.
alter table public.systematic_nodes
  drop constraint if exists systematic_nodes_visibility_ck;
alter table public.systematic_nodes
  add constraint systematic_nodes_visibility_ck
  check (not (case_only and article_only));
