-- 타 단원 지문 표시 (원장 지시 2026-08-21)
--
-- 종합문제의 지문 중 일부는 해당 단원만 학습해서는 풀 수 없는 — 다른 단원의 내용을
-- 담은 지문이다. 교재 원본은 이를 기울임체로 구분해 두었으나, 기울임체는 가독성이
-- 떨어진다는 수강생 의견이 있어 플랫폼은 별도 표시(배지)로 대체한다.
--
-- 선지(problem_choices)와 보기 박스 항목(problem_box_items) 양쪽에 있다.
-- 원천은 워크북 HWPX 의 charPr italic — scripts/workbook/extract-cross-unit.mjs 참조.

begin;

alter table public.problem_choices
  add column if not exists cross_unit boolean not null default false;

alter table public.problem_box_items
  add column if not exists cross_unit boolean not null default false;

comment on column public.problem_choices.cross_unit is
  '다른 단원의 내용을 포함한 지문(교재 원본 기울임체). 학습 화면에서 배지로 표시.';
comment on column public.problem_box_items.cross_unit is
  '다른 단원의 내용을 포함한 보기 항목(교재 원본 기울임체). 학습 화면에서 배지로 표시.';

commit;
