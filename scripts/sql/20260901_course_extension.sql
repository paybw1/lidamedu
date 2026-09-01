-- feat-11-010 — 온라인 단과 수강기간 연장 (요청서_0901 §3).
-- 설계: docs/features/feat-11-010-course-extension.md

-- ── ① 강의별 연장 정책 ─────────────────────────────────────────────────────
-- ★NULL = "기본값(app_settings)을 따른다". 그래서 NOT NULL·기본값을 뗀다.
--   기존 2행은 명시값(true)이라 동작이 그대로다.
-- ★새 플래그를 만들지 않고 extension_allowed 를 그대로 쓴다 — 같은 뜻의 플래그가 둘이면
--   어느 쪽이 이기는지 아무도 모르게 된다.
alter table public.plan_policies
  alter column extension_allowed drop not null,
  alter column extension_allowed drop default;

alter table public.plan_policies
  add column if not exists extension_price_krw integer,
  add column if not exists extension_max_count integer,
  add column if not exists extension_days      integer;

comment on column public.plan_policies.extension_allowed is
  '유료 수강기간 연장 허용. NULL = 기본값(app_settings.course_ext_enabled_default)';
comment on column public.plan_policies.extension_price_krw is
  '1회 연장 결제 금액. NULL = 기본값';
comment on column public.plan_policies.extension_max_count is
  '최대 연장 횟수. 0 = 무제한, NULL = 기본값';
comment on column public.plan_policies.extension_days is
  '1회 연장 일수. 0 = 강의 기본 학습일수(duration_days), NULL = 기본값';

-- ── ② 주문 항목 → 어느 수강권을 늘리는지 ───────────────────────────────────
alter table public.order_items
  add column if not exists enrollment_id uuid references public.enrollments(enrollment_id);

comment on column public.order_items.enrollment_id is
  'item_type=course_extension 일 때 연장 대상 수강권';

-- ── ③ 연장 이력 ────────────────────────────────────────────────────────────
-- ★order_item_id UNIQUE 가 이중 연장을 막는다. 웹훅·confirm 이중 호출은 흔하고,
--   애플리케이션 카운트 체크로는 경쟁 조건을 못 막는다.
-- ★연장 횟수는 별도 카운터 컬럼이 아니라 이 표의 status='applied' 개수로 센다
--   (카운터를 두면 환불 때 어긋난다).
create table if not exists public.enrollment_extensions (
  extension_id    uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references public.enrollments(enrollment_id),
  user_id         uuid not null references public.profiles(profile_id),
  plan_id         uuid references public.subscription_plans(plan_id),
  order_item_id   uuid unique references public.order_items(order_item_id),
  days_added      integer not null,
  prev_expires_at timestamptz not null,
  next_expires_at timestamptz not null,
  amount_krw      integer not null default 0,
  status          text not null default 'applied',
  reverted_at     timestamptz,
  revert_reason   text,
  granted_by      uuid references public.profiles(profile_id),
  note            text,
  created_at      timestamptz not null default now(),
  constraint enrollment_extensions_status_check check (status in ('applied', 'reverted'))
);

comment on table public.enrollment_extensions is
  'feat-11-010 수강기간 연장 이력. 연장 횟수 = status=applied 개수.';

create index if not exists enrollment_extensions_enrollment_idx
  on public.enrollment_extensions (enrollment_id, created_at desc);
create index if not exists enrollment_extensions_user_idx
  on public.enrollment_extensions (user_id, created_at desc);

alter table public.enrollment_extensions enable row level security;

-- 본인 이력은 본인이 읽는다(마이페이지 "연장 내역"). staff 는 전부.
drop policy if exists enrollment_extensions_read on public.enrollment_extensions;
create policy enrollment_extensions_read on public.enrollment_extensions
  for select using (
    user_id = (select auth.uid()) or private.is_staff((select auth.uid()))
  );

-- 쓰기는 서버(service_role)만 — 결제 성공 경로에서만 적재된다.
-- staff 수동 예외도 서버 액션을 거치므로 여기 쓰기 정책을 열지 않는다.
