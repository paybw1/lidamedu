-- feat-7-005 후속: "비고 — 전체 판결문"(cases.comment_body_md) 블록의 학생 뷰어 표시
-- 분류를 staff 가 선택 가능하게. 비고 / 관련판례 / 평석 중 하나.
--   remark        → "비고 (전체 판결문)"  (기존 동작 = 기본값, 소급 보존)
--   related_cases → "관련판례"
--   commentary    → "평석"
alter table public.cases
  add column if not exists comment_label text not null default 'remark';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cases_comment_label_check'
  ) then
    alter table public.cases
      add constraint cases_comment_label_check
      check (comment_label in ('remark', 'related_cases', 'commentary'));
  end if;
end $$;
