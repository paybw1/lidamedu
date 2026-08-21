-- feat-7-048 Stage C — 과목 축 · 과목 색상 · 기록 시각
-- 설계: docs/features/feat-7-048-cohort-ops-v2.md §4 M3 · D5 · D6
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_stage_c.sql
begin;

-- 1. 과목 축 — 색상·타이머·'계획 외 학습 과목 선택'의 공통 전제.
--    법과목은 node_id 에서 파생되지만 자연과학·기타는 파생할 근거가 없다.
--    NULL = 미분류(센티넬 금지). 값 집합은 study-plans/subject-axis.ts 가 SSOT.
alter table public.study_plan_items
  add column if not exists subject_kind text
    check (subject_kind in ('law', 'science', 'other')),
  add column if not exists subject_code text;

-- ★study_logs 는 append-only 원장 — 이 컬럼들은 INSERT 시점에만 채운다.
--   과거 로그(NULL)는 조회 때 plan_item → node → law_code 로 파생해 보여준다.
alter table public.study_logs
  add column if not exists subject_kind text
    check (subject_kind in ('law', 'science', 'other')),
  add column if not exists subject_code text,
  -- Stage E 타이머와 '총량 입력 + 시작 시각'이 채운다. 시각 미지정 기록은 NULL.
  add column if not exists started_at timestamptz,
  add column if not exists ended_at   timestamptz;

create index if not exists study_logs_subject_idx
  on public.study_logs (user_id, log_date)
  where subject_code is not null;

comment on column public.study_logs.subject_kind is
  'INSERT 시점에만 채운다(append-only) — 계획 항목 상속 → 노드 파생 → 사용자 선택 → NULL';

-- 2. 과목 색상 — 팔레트 키만 저장한다(다크 모드 정합: hex 금지).
--    기본 매핑은 코드에 있고, 이 테이블은 학생별 오버라이드만 담는다.
create table if not exists public.student_subject_colors (
  user_id      uuid not null references public.profiles(profile_id) on delete cascade,
  subject_kind text not null check (subject_kind in ('law', 'science', 'other')),
  subject_code text not null,
  color_key    text not null check (color_key in
    ('sky', 'emerald', 'violet', 'amber', 'rose', 'teal', 'orange', 'slate')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_code)
);

alter table public.student_subject_colors enable row level security;

drop policy if exists student_subject_colors_own on public.student_subject_colors;
create policy student_subject_colors_own on public.student_subject_colors for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists student_subject_colors_staff_select on public.student_subject_colors;
create policy student_subject_colors_staff_select on public.student_subject_colors for select
  to authenticated using (private.is_staff(auth.uid()));

commit;
