-- feat-2-023c — 학생별 암기카드 구성 필터(중요도 하한 + 즐겨찾기).
-- srs_items 에 importance 비정규화(원본 조문/판례에서). srs_user_settings 에 학생 필터 설정.

-- 1) 카드에 중요도 비정규화(원본에서). 재생성 시 card-gen 이 동기화.
alter table public.srs_items
  add column if not exists importance smallint not null default 0;

update public.srs_items s
  set importance = coalesce(a.importance, 0)
  from public.articles a
  where s.source_type = 'article' and s.source_id = a.article_id;

update public.srs_items s
  set importance = coalesce(c.importance, 0)
  from public.cases c
  where s.source_type = 'case' and s.source_id = c.case_id;

create index if not exists srs_items_importance_idx
  on public.srs_items(subject, source_type, importance);

-- 2) 학생 필터 설정 — 중요도 하한(0=전체) + 즐겨찾기만.
alter table public.srs_user_settings
  add column if not exists importance_min smallint not null default 0;
alter table public.srs_user_settings
  add column if not exists bookmarked_only boolean not null default false;
