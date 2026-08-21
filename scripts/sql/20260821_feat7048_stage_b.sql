-- feat-7-048 Stage B — 상담자 계획 직접 편집
-- 설계: docs/features/feat-7-048-cohort-ops-v2.md §4 M2 · D9
-- 운영 적용: node scripts/run-prod-sql.mjs scripts/sql/20260821_feat7048_stage_b.sql
begin;

-- 1. 귀속 — 누가 쓴 계획인지. 운영 게이트(제출률)가 학생 제출과 상담자 작성을
--    갈라 세려면 이 컬럼이 필요하다.
alter table public.study_plans
  add column if not exists authored_by uuid references public.profiles(profile_id);
alter table public.study_plan_items
  add column if not exists updated_by uuid references public.profiles(profile_id);

comment on column public.study_plans.authored_by is
  '상담자가 직접 작성·편집한 계획이면 그 staff id. 학생이 쓴 계획은 NULL '
  '— scripts/ops/phase3-gate-metrics.mjs 제출률에서 분리 집계한다';

-- 2. staff 쓰기 범위 축소 — 지금까지 study_plans/items 의 staff 정책이 FOR ALL 이라
--    승인본까지 고칠 수 있었다(화면이 없어 드러나지 않았을 뿐). Stage B 로 편집
--    화면이 생기므로 **승인본은 RLS 에서 잠근다** — 승인 후 불변은 이 시스템의 전제고,
--    승인 자체는 security definer RPC(approve_study_plan)라 이 정책에 걸리지 않는다.
drop policy if exists study_plans_staff_all on public.study_plans;
create policy study_plans_staff_select on public.study_plans for select
  to authenticated using (private.is_staff(auth.uid()));
create policy study_plans_staff_insert on public.study_plans for insert
  to authenticated with check (
    private.is_staff(auth.uid()) and status <> 'approved'
  );
create policy study_plans_staff_update on public.study_plans for update
  to authenticated
  using (private.is_staff(auth.uid()) and status <> 'approved')
  with check (private.is_staff(auth.uid()) and status <> 'approved');
create policy study_plans_staff_delete on public.study_plans for delete
  to authenticated using (private.is_staff(auth.uid()) and status <> 'approved');

drop policy if exists study_plan_items_staff_all on public.study_plan_items;
create policy study_plan_items_staff_select on public.study_plan_items for select
  to authenticated using (private.is_staff(auth.uid()));
create policy study_plan_items_staff_insert on public.study_plan_items for insert
  to authenticated with check (
    private.is_staff(auth.uid()) and is_locked = false
    and exists (select 1 from public.study_plans p
                where p.plan_id = study_plan_items.plan_id and p.status <> 'approved')
  );
create policy study_plan_items_staff_update on public.study_plan_items for update
  to authenticated
  using (
    private.is_staff(auth.uid()) and is_locked = false
    and exists (select 1 from public.study_plans p
                where p.plan_id = study_plan_items.plan_id and p.status <> 'approved')
  )
  with check (
    private.is_staff(auth.uid()) and is_locked = false
    and exists (select 1 from public.study_plans p
                where p.plan_id = study_plan_items.plan_id and p.status <> 'approved')
  );
create policy study_plan_items_staff_delete on public.study_plan_items for delete
  to authenticated using (
    private.is_staff(auth.uid()) and is_locked = false
    and exists (select 1 from public.study_plans p
                where p.plan_id = study_plan_items.plan_id and p.status <> 'approved')
  );

commit;
