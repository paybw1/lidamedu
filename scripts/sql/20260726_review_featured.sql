-- feat-11-006 후속 — 수강 후기 랜딩 노출 큐레이션.
--   운영자가 취사선택한 후기를 강의 플랫폼 랜딩(/lecture/home)에 노출한다.
alter table public.course_reviews
  add column if not exists is_featured boolean not null default false;
alter table public.course_reviews
  add column if not exists featured_at timestamptz;

comment on column public.course_reviews.is_featured is
  '강의 랜딩(/lecture/home) 노출 여부 — 운영자 큐레이션. is_public·미블라인드 전제.';

-- 랜딩 조회용 — 노출 켠 것만 최근 지정 순.
create index if not exists course_reviews_featured_idx
  on public.course_reviews (featured_at desc)
  where is_featured;
