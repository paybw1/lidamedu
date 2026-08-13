-- Phase 3 — 진단·월간 계획·승인·기록. 설계 SSOT: docs/plans/phase3-stage1-design.md
-- + Stage 1 승인 반영: 준수율=현재 승인본(2.2)·승인 전이 RPC(2.3)·tier 철회 표시(2.4)
begin;

-- ── 1. 진단 — 학생당 1행 (현재 상태) ─────────────────────────────────────────
create table if not exists public.student_diagnostics (
  user_id uuid primary key references public.profiles(profile_id) on delete cascade,
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  attempt_type text not null check (attempt_type in ('first', 'repeat')),
  weekday_minutes integer not null check (weekday_minutes between 0 and 1440),
  weekend_minutes integer not null check (weekend_minutes between 0 and 1440),
  note text,
  updated_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.student_diagnostics is
  '오프라인 종합반 초기 진단 — 초시/재시·가용시간. 과욕 지수의 분모(선언 가용시간)';

-- ── 2. 과목별 수준 — (user, kind, code) 1행 ─────────────────────────────────
create table if not exists public.student_subject_status (
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  subject_kind text not null check (subject_kind in ('law', 'science')),
  subject_code text not null,
  lecture_stage text check (lecture_stage in ('none', 'basic', 'advanced', 'complete')),
  science_tier text check (science_tier in ('high', 'mid', 'low')),
  science_score integer check (science_score >= 0),
  science_total integer check (science_total > 0),
  -- diagnostic_retracted = 진단 시험 철회 후 재확인 필요(승인 2.4) — 값은 유지, 경고 표시
  tier_source text check (tier_source in ('manual', 'diagnostic_test', 'diagnostic_retracted')),
  diagnostic_test_id uuid references public.offline_tests(test_id) on delete set null,
  completed_lectures text,
  direction text,
  updated_by uuid references public.profiles(profile_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_kind, subject_code),
  constraint student_subject_status_code_check check (
    (subject_kind = 'law'
      and subject_code in ('patent', 'trademark', 'design', 'civil', 'civil-procedure'))
    or (subject_kind = 'science'
      and subject_code in ('physics', 'chemistry', 'biology', 'earth_science'))
  ),
  constraint student_subject_status_score_pair check (
    science_score is null or (science_total is not null and science_score <= science_total)
  )
);

-- ── 3. 월간 계획 — 버전 체인 (준수율 = 현재 승인본 기준, 승인 2.2) ──────────
create table if not exists public.study_plans (
  plan_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  cohort_id uuid not null references public.cohorts(cohort_id) on delete cascade,
  period_start date not null,
  period_end date not null,
  version integer not null default 1 check (version >= 1),
  -- v1 = NULL(자기 자신이 루트). 변경 횟수 집계용(승인 2.2 — baseline 고정은 철회됨).
  root_plan_id uuid references public.study_plans(plan_id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'revision_requested', 'superseded')),
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(profile_id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  baseline_locked_at timestamptz,
  planned_weekday_minutes integer,
  planned_weekend_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plans_period_check check (period_end >= period_start),
  unique (user_id, period_start, version)
);
comment on table public.study_plans is
  '월간 학습계획 — 승인 후 불변, 수정 = 새 version + 기존 superseded. 준수율 = 현재 승인본 기준(이력은 체크포인트 스냅샷)';

-- in-flight(편집·심사 중) (user, period) 당 1개 / 승인본 1개 — 파셜 유니크 2분할.
create unique index if not exists study_plans_inflight_uniq
  on public.study_plans (user_id, period_start)
  where status in ('draft', 'submitted', 'revision_requested');
create unique index if not exists study_plans_approved_uniq
  on public.study_plans (user_id, period_start)
  where status = 'approved';
create index if not exists study_plans_review_queue_idx
  on public.study_plans (cohort_id, status, submitted_at);

create table if not exists public.study_plan_items (
  item_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(plan_id) on delete cascade,
  priority integer,
  title text not null,
  node_id uuid references public.systematic_nodes(node_id) on delete set null,
  lesson_id uuid references public.course_lessons(lesson_id) on delete set null,
  activity_type text not null check (activity_type in
    ('lecture', 'review', 'problem', 'memorize', 'reading', 'essay', 'other')),
  daily_minutes integer not null check (daily_minutes between 1 and 1440),
  day_scope text not null check (day_scope in ('weekday', 'weekend', 'all')),
  start_date date not null,
  end_date date not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_plan_items_period_check check (end_date >= start_date)
);
create index if not exists study_plan_items_plan_idx on public.study_plan_items (plan_id);

-- ── 4. 일일 기록 — APPEND ONLY 원장 (Stage 3 에서 화면 배선) ─────────────────
create table if not exists public.study_logs (
  log_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(profile_id) on delete cascade,
  log_date date not null,
  plan_item_id uuid references public.study_plan_items(item_id) on delete set null,
  node_id uuid references public.systematic_nodes(node_id) on delete set null,
  lesson_id uuid references public.course_lessons(lesson_id) on delete set null,
  activity_type text not null check (activity_type in
    ('lecture', 'review', 'problem', 'memorize', 'reading', 'essay', 'other')),
  minutes integer not null,
  source text not null check (source in ('plan_check', 'manual')),
  completion text not null default 'full' check (completion in ('full', 'partial', 'none')),
  node_resolved_from text check (node_resolved_from in ('direct', 'lesson')),
  self_difficulty integer check (self_difficulty between 1 and 5),
  reverses_log_id uuid references public.study_logs(log_id) on delete set null,
  created_at timestamptz not null default now(),
  constraint study_logs_reversal_sign check (
    (reverses_log_id is null and minutes between 1 and 1440)
    or (reverses_log_id is not null and minutes between -1440 and -1)
  )
);
comment on table public.study_logs is
  '오프라인 학습시간 원장 — append only(UPDATE/DELETE 없음). 취소는 reverses_log_id + 음수 분';
create index if not exists study_logs_user_date_idx on public.study_logs (user_id, log_date);
create index if not exists study_logs_item_idx on public.study_logs (plan_item_id)
  where plan_item_id is not null;
create index if not exists study_logs_node_idx on public.study_logs (node_id)
  where node_id is not null;
create unique index if not exists study_logs_reversal_uniq
  on public.study_logs (reverses_log_id) where reverses_log_id is not null;

-- ── 5. 격주 체크포인트 — checkpoint_date 기준 소급 계산 스냅샷 (승인 2.1) ────
create table if not exists public.study_plan_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(plan_id) on delete cascade,
  checkpoint_date date not null,
  planned_minutes_to_date integer not null,
  actual_minutes_to_date integer not null,
  item_breakdown jsonb not null default '[]'::jsonb,
  note text,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  unique (plan_id, checkpoint_date)
);
comment on table public.study_plan_checkpoints is
  '격주 체크포인트 — 집계는 checkpoint_date 기준 소급 계산(늦게 생성해도 동일 값 재현, append-only 원장 전제). 기존 행 재계산 금지';

-- ── 6. offline_tests — 진단 테스트 지정 ─────────────────────────────────────
alter table public.offline_tests
  add column if not exists is_diagnostic boolean not null default false;
comment on column public.offline_tests.is_diagnostic is
  '자연과학 진단 테스트 — true 인 시험의 성적 저장 시 응시 학생 전원 science tier 자동 갱신';

-- ── 7. 승인 전이 RPC — 단일 트랜잭션 (승인 2.3) ─────────────────────────────
-- supersede + approve 가 원자적이어야 approved 파셜 유니크 아래에서 동시 승인이 안전.
create or replace function public.approve_study_plan(
  p_plan_id uuid,
  p_comment text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_plan public.study_plans%rowtype;
  v_owner uuid;
  v_weekday integer;
  v_weekend integer;
begin
  select role::text into v_role from public.profiles where profile_id = v_uid;
  if v_role is null or v_role not in ('instructor', 'manager', 'admin') then
    raise exception 'forbidden';
  end if;

  select * into v_plan from public.study_plans where plan_id = p_plan_id for update;
  if not found then
    raise exception 'plan not found';
  end if;
  if v_plan.status <> 'submitted' then
    raise exception 'plan is not submitted';
  end if;

  -- 반 소유권 — manager/admin 전체, instructor 는 본인 소유 반만.
  if v_role = 'instructor' then
    select owner_id into v_owner from public.cohorts where cohort_id = v_plan.cohort_id;
    if v_owner is distinct from v_uid then
      raise exception 'not cohort owner';
    end if;
  end if;

  -- 기존 승인본 supersede (같은 학생·같은 기간) — approve 보다 선행.
  update public.study_plans
    set status = 'superseded', updated_at = now()
    where user_id = v_plan.user_id
      and period_start = v_plan.period_start
      and status = 'approved';

  -- 진단 가용시간 동결 스냅샷.
  select weekday_minutes, weekend_minutes into v_weekday, v_weekend
    from public.student_diagnostics where user_id = v_plan.user_id;

  update public.study_plans
    set status = 'approved',
        reviewed_by = v_uid,
        reviewed_at = now(),
        review_comment = p_comment,
        baseline_locked_at = now(),
        planned_weekday_minutes = v_weekday,
        planned_weekend_minutes = v_weekend,
        updated_at = now()
    where plan_id = p_plan_id;

  update public.study_plan_items
    set is_locked = true, updated_at = now()
    where plan_id = p_plan_id;

  return jsonb_build_object('ok', true, 'planId', p_plan_id);
end;
$$;
revoke all on function public.approve_study_plan(uuid, text) from public;
grant execute on function public.approve_study_plan(uuid, text) to authenticated;

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
alter table public.student_diagnostics enable row level security;
alter table public.student_subject_status enable row level security;
alter table public.study_plans enable row level security;
alter table public.study_plan_items enable row level security;
alter table public.study_logs enable row level security;
alter table public.study_plan_checkpoints enable row level security;

create policy student_diagnostics_staff_all on public.student_diagnostics for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy student_subject_status_staff_all on public.student_subject_status for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_plans_staff_all on public.study_plans for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_plan_items_staff_all on public.study_plan_items for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));
create policy study_logs_staff_select on public.study_logs for select
  to authenticated using (private.is_staff(auth.uid()));
create policy study_plan_checkpoints_staff_all on public.study_plan_checkpoints for all
  to authenticated using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

create policy student_diagnostics_select_own on public.student_diagnostics for select
  to authenticated using (user_id = auth.uid());
create policy student_subject_status_select_own on public.student_subject_status for select
  to authenticated using (user_id = auth.uid());

create policy study_plans_select_own on public.study_plans for select
  to authenticated using (user_id = auth.uid());
create policy study_plans_insert_own on public.study_plans for insert
  to authenticated with check (
    user_id = auth.uid() and status in ('draft')
    and exists (select 1 from public.cohort_members cm
                where cm.cohort_id = study_plans.cohort_id and cm.profile_id = auth.uid())
  );
create policy study_plans_update_own on public.study_plans for update
  to authenticated
  using (user_id = auth.uid() and status in ('draft', 'revision_requested'))
  with check (
    user_id = auth.uid()
    and status in ('draft', 'submitted', 'revision_requested')
    and exists (select 1 from public.cohort_members cm
                where cm.cohort_id = study_plans.cohort_id and cm.profile_id = auth.uid())
  );

create policy study_plan_items_select_own on public.study_plan_items for select
  to authenticated using (
    exists (select 1 from public.study_plans p
            where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid())
  );
create policy study_plan_items_insert_own on public.study_plan_items for insert
  to authenticated with check (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );
create policy study_plan_items_update_own on public.study_plan_items for update
  to authenticated
  using (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  )
  with check (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );
create policy study_plan_items_delete_own on public.study_plan_items for delete
  to authenticated using (
    is_locked = false and exists (
      select 1 from public.study_plans p
      where p.plan_id = study_plan_items.plan_id and p.user_id = auth.uid()
        and p.status in ('draft', 'revision_requested'))
  );

create policy study_logs_select_own on public.study_logs for select
  to authenticated using (user_id = auth.uid());
create policy study_logs_insert_own on public.study_logs for insert
  to authenticated with check (
    user_id = auth.uid()
    and (reverses_log_id is null or exists (
      select 1 from public.study_logs l
      where l.log_id = study_logs.reverses_log_id and l.user_id = auth.uid()))
    and (plan_item_id is null or exists (
      select 1 from public.study_plan_items i
      join public.study_plans p on p.plan_id = i.plan_id
      where i.item_id = study_logs.plan_item_id and p.user_id = auth.uid()))
  );

create policy study_plan_checkpoints_select_own on public.study_plan_checkpoints for select
  to authenticated using (
    exists (select 1 from public.study_plans p
            where p.plan_id = study_plan_checkpoints.plan_id and p.user_id = auth.uid())
  );

commit;
