-- feat-11-004 슬라이스 4d — 쿠폰 개인 발급 · CS 처리 이력 · 재생 오류 로그 · 매출 파생 뷰 · access duty 4종

-- 1) 쿠폰 자동 발급 정의 — discounts 확장 (정의부 SSOT 유지)
alter table public.discounts
  add column auto_issue text check (auto_issue in ('signup','first_purchase'));
comment on column public.discounts.auto_issue is
  '자동 발급 트리거 — signup(가입)/first_purchase(첫 구매). null=자동 발급 아님. 발급 쿠폰 사용은 기존 code 입력 흐름.';

-- 개인 발급/사용 내역
create table public.user_coupons (
  user_coupon_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  discount_id uuid not null references public.discounts (discount_id) on delete cascade,
  issued_reason text not null check (issued_reason in ('signup','first_purchase','admin','event')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  order_id uuid references public.orders (order_id) on delete set null,
  unique (user_id, discount_id)                 -- 같은 쿠폰 중복 발급 방지
);
create index user_coupons_user_idx on public.user_coupons (user_id);

alter table public.user_coupons enable row level security;
create policy user_coupons_select_own_or_staff on public.user_coupons
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
-- 발급·사용 마킹은 서버 전용.

-- 2) CS 처리 이력 — 모든 CS 조치의 공통 원장(각 도메인 원장 행을 참조)
create table public.cs_actions (
  action_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,   -- 대상 회원
  actor_id uuid references public.profiles (profile_id) on delete set null,          -- 처리 스태프
  kind text not null check (kind in (
    'device_reset','multiplier_credit','multiplier_reset','period_extend',
    'enrollment_block','enrollment_grant','enrollment_revoke','pause_admin',
    'refund_assist','memo'
  )),
  ref_table text,
  ref_id text,
  note text not null,
  created_at timestamptz not null default now()
);
create index cs_actions_user_idx on public.cs_actions (user_id, created_at desc);

alter table public.cs_actions enable row level security;
create policy cs_actions_select_staff on public.cs_actions
  for select using (private.is_staff((select auth.uid())));

-- 3) 재생 오류 로그 (장애 대응 ★★~★★★) — [벤더] 플레이어 오류 콜백이 채움
create table public.playback_issues (
  issue_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (profile_id) on delete set null,
  grant_id uuid references public.playback_grants (grant_id) on delete set null,
  lesson_id uuid references public.course_lessons (lesson_id) on delete set null,
  video_id uuid references public.lesson_videos (video_id) on delete set null,
  error_code text,
  client_env jsonb,
  message text,
  created_at timestamptz not null default now()
);
create index playback_issues_created_idx on public.playback_issues (created_at desc);

alter table public.playback_issues enable row level security;
create policy playback_issues_select_staff on public.playback_issues
  for select using (private.is_staff((select auth.uid())));

-- 4) 매출 파생 뷰 (저장 아님) — 주문 기준 일 매출·환불, 도서 분리
create view public.v_sales_daily with (security_invoker = true) as
with refunds as (
  select order_id, sum(refund_amount_krw)::bigint as refund_krw
  from public.order_items
  where refund_amount_krw is not null
  group by order_id
)
select
  (o.created_at at time zone 'Asia/Seoul')::date as sale_date,
  count(*) filter (where o.status in ('paid','partially_refunded','refunded')) as orders_count,
  coalesce(sum(o.total_krw) filter (where o.status in ('paid','partially_refunded','refunded')), 0)::bigint as gross_krw,
  coalesce(sum(r.refund_krw), 0)::bigint as refund_krw
from public.orders o
left join refunds r on r.order_id = o.order_id
group by 1;

create view public.v_sales_books with (security_invoker = true) as
select
  b.book_id,
  b.title,
  count(oi.order_item_id) filter (where oi.refunded_at is null) as sold_count,
  coalesce(sum(oi.unit_price_krw * oi.quantity) filter (where oi.refunded_at is null), 0)::bigint as gross_krw
from public.books b
left join public.order_items oi
  on oi.book_id = b.book_id
 and oi.order_id in (select order_id from public.orders where status in ('paid','partially_refunded'))
group by b.book_id, b.title;

-- 5) access duty 4종 (설계 §3.12) — 관리자 관리에서 배정
alter table public.staff_duty_assignments
  drop constraint if exists staff_duty_assignments_duty_check;
alter table public.staff_duty_assignments
  add constraint staff_duty_assignments_duty_check check (duty in (
    'upgrade_request','bug_report','qna_question','review_request','ai_usage_alert','lecture_abuse_alert',
    'student_admin_access',
    'lms_video_admin',    -- 영상/상품/도서 등록
    'lms_cs',             -- 수강권·기기·배수 CS
    'lms_orders_admin',   -- 주문·환불·배송
    'lms_stats_view'      -- 매출 통계 열람
  ));
