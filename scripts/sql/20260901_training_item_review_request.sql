-- feat-14-N1 후속 — "작업 중" 과 "봐 주세요" 를 가른다.
--
-- 검수 큐를 만들자마자 드러난 문제: `review_status='draft'` 에 **만들다 만 것**과
-- **검수 요청된 것**이 섞여 있다. 2차 훈련 항목 34건은 원장이 미완성이라 의도적으로
-- 닫아 둔 것인데 큐가 대기로 세어, 계기판이 첫날부터 "안 해도 되는 일"을 할 일로 보여 줬다.
--
-- ★상태를 하나 더 만들지 않고 **요청 시각**을 둔다 — 언제 요청했는지가 남고,
--   null = 작업 중이라는 뜻이 자명하다.
-- ★백필하지 않는다 — 지금 draft 34건은 전부 작업 중이 맞다(원장 확인 2026-09-01).
--   준비되면 편집 화면에서 「검수 요청」을 누른다.

alter table public.case_training_items
  add column if not exists review_requested_at timestamptz;

comment on column public.case_training_items.review_requested_at is
  '검수 요청 시각. null = 작업 중(검수 큐·워크큐에서 제외). feat-14-N1.';

-- 큐가 draft + 요청됨 만 훑는다.
create index if not exists case_training_items_review_requested_idx
  on public.case_training_items (review_status, review_requested_at)
  where deleted_at is null;
