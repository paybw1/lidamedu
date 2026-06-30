-- feat — 스태프 OX 수동 숨김. 구조적 ox_ineligible 과 분리(검수 화면에서 "스태프 숨김"으로 구분 표시).
-- nullable 컬럼 추가(기본 NULL = 미숨김) — 운영 데이터 무영향, ADD COLUMN 즉시(메타데이터).
-- ox_hidden_by 는 누가 숨겼는지(감사). profiles(profile_id) 참조.

alter table public.problem_choices
  add column if not exists ox_hidden_at timestamptz,
  add column if not exists ox_hidden_by uuid references public.profiles(profile_id) on delete set null;

alter table public.problem_box_items
  add column if not exists ox_hidden_at timestamptz,
  add column if not exists ox_hidden_by uuid references public.profiles(profile_id) on delete set null;

-- 학생 OX 패널 쿼리가 ox_hidden_at IS NULL 로 거르므로, 부분 인덱스로 숨김 제외 조회 가속.
create index if not exists idx_problem_choices_ox_hidden
  on public.problem_choices (related_article_id)
  where ox_hidden_at is null and ox_ineligible = false and ox_truth is not null;
create index if not exists idx_problem_box_items_ox_hidden
  on public.problem_box_items (related_article_id)
  where ox_hidden_at is null and ox_ineligible = false and ox_truth is not null;
