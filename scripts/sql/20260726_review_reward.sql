-- feat-11-006 후속 — 수강 후기 작성 보상(포인트) 지급 추적.
--   대상(강의/교재)당 1회만 지급. 소프트삭제 후 재작성 어뷰즈 방지 위해 지급 여부는
--   course_reviews 행(삭제분 포함)에 기록하고 재작성 시 승계한다.
alter table public.course_reviews
  add column if not exists points_awarded_at timestamptz;

comment on column public.course_reviews.points_awarded_at is
  '수강 후기 작성 보상 포인트 지급 시각(대상당 1회). NULL=미지급.';
