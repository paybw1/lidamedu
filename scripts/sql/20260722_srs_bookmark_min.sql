-- feat-2-023c 후속 — 즐겨찾기 필터를 별 단계 하한(0~5)으로. 중요도·즐겨찾기 각각 독립.
-- bookmarked_only(불리언, 당일 도입) → bookmark_min(0=사용안함, 1~5=즐겨찾기 별 N 이상).

alter table public.srs_user_settings
  add column if not exists bookmark_min smallint not null default 0;

-- 기존 bookmarked_only=true 는 즐겨찾기 ★1 이상으로 이관.
update public.srs_user_settings
  set bookmark_min = 1
  where bookmark_min = 0
    and coalesce(bookmarked_only, false) = true;

alter table public.srs_user_settings
  drop column if exists bookmarked_only;
