-- feat-11-009 — 메인화면 모듈 시드.
-- ★현재 /lecture/home 의 구성·순서를 그대로 옮긴다. 시드 직후 화면이 지금과 같아야 한다.
--   (모듈이 0건이면 화면은 코드의 폴백 순서로 렌더되므로, 시드 전후 결과가 동일하다.)
-- 멱등 — 이미 시드된 행이 있으면 아무 것도 하지 않는다(운영자가 편집한 구성을 덮지 않게).

insert into public.main_page_modules (kind, label, config, sort_order)
select v.kind, v.label, v.config::jsonb, v.sort_order
from (values
  ('hero_banner',        '메인 히어로(1단)', '{"tier":1}', 0),
  ('hero_banner',        '추가 배너 2단',    '{"tier":2}', 1),
  ('hero_banner',        '추가 배너 3단',    '{"tier":3}', 2),
  ('builtin_video',      null,               '{}',         3),
  ('builtin_news',       null,               '{}',         4),
  ('builtin_schedule',   null,               '{}',         5),
  ('builtin_curriculum', null,               '{}',         6),
  ('builtin_books',      null,               '{}',         7),
  ('builtin_instructors',null,               '{}',         8),
  ('builtin_reviews',    null,               '{}',         9),
  ('builtin_passers',    null,               '{}',        10),
  ('builtin_faq',        null,               '{}',        11),
  ('builtin_final',      null,               '{}',        12)
) as v(kind, label, config, sort_order)
where not exists (select 1 from public.main_page_modules where deleted_at is null);

select sort_order, kind, label
from public.main_page_modules
where deleted_at is null
order by sort_order;
