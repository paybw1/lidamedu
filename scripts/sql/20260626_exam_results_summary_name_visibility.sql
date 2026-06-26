-- 합격 수기 작성자 표시 이름 모드. 기본 anonymous(익명) — 작성자가 명시적으로
-- 실명/닉네임을 골라야만 합격 수기 모음에 이름이 노출된다(opt-in).
--   anonymous : 이름 미표시(현행 동작 유지 — 기존 행 전부 익명)
--   real_name : profiles.name 표시
--   nickname  : profiles.nickname 표시
alter table public.exam_results
  add column if not exists summary_name_visibility text not null default 'anonymous'
    check (summary_name_visibility in ('anonymous', 'real_name', 'nickname'));

comment on column public.exam_results.summary_name_visibility is
  '합격 수기 작성자 표시 이름 모드 — anonymous(비공개)/real_name(profiles.name)/nickname(profiles.nickname). 기본 anonymous(기존 행 익명 유지).';
