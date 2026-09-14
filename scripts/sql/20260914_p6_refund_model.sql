-- feat-11-013 P6-a — 환불 모델 3종 (요청서 PART B §2·§6~§10, 설계 D7).
--
-- ★기존 `refund_requests` 는 건드리지 않는다. 소유자가 **학생**이고 상태가 3값인 다른 모델이다.
--   같은 테이블에 12상태를 얹으면 두 모델이 섞인다. 신규 생성만 끊고(코드 쪽 P6-e) 행은 남긴다.
--   ※운영 실측 2026-09-14: refund_requests 는 **역대 0행**이다. 이관할 데이터가 없다.
--
-- ★이 마이그레이션은 **추가만** 한다(테이블 3·인덱스·RLS·트리거). 기존 칸을 바꾸지 않는다.

-- ── 1. refunds — 헤더 ───────────────────────────────────────────────────────
create table if not exists public.refunds (
  refund_id            uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(order_id) on delete cascade,
  -- ★비정규화 — 목록·배지가 회원 기준으로 도는데 매번 orders 를 조인하지 않기 위해서다.
  user_id              uuid not null references public.profiles(profile_id) on delete cascade,
  status               text not null default 'received',

  -- 접수 (요청서 §2 「환불신청 등록 입력항목」)
  intake_channel       text,
  intake_at            timestamptz not null default now(),
  intake_by            uuid references public.profiles(profile_id),
  request_reason       text,
  consult_note         text,
  attachments          jsonb not null default '[]'::jsonb,
  admin_memo           text,

  -- 금액 (요청서 §6 「금액 항목」)
  -- ★「환불 후 누적 환불액」과 「남은 환불 가능금액」은 **저장하지 않는다.** 둘 다
  --   prior + this / original − (prior + this) 로 나오는 파생값이고, 저장하면 세 칸이
  --   서로 다른 말을 하는 순간이 온다(개발원칙 Layer 2 — derived 는 projection).
  original_paid_krw    integer,
  prior_refunded_krw   integer,
  this_refund_krw      integer,
  refund_method        text,

  -- 토스 취소결과 — ★관리자가 상점관리자에서 직접 취소하고 **결과를 옮겨 적는다**(요청서 §5·§6).
  --   이 네 칸(금액·일시·거래번호·처리자)이 다 차야 환불완료로 갈 수 있다.
  pg_cancel_krw        integer,
  pg_cancel_kind       text,
  pg_cancelled_at      timestamptz,
  pg_transaction_no    text,
  pg_operator          uuid references public.profiles(profile_id),
  pg_evidence          jsonb not null default '[]'::jsonb,

  -- 처리
  assignee_id          uuid references public.profiles(profile_id),
  sms_sent_at          timestamptz,
  email_sent_at        timestamptz,
  closed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 상태 12값 — 사람이 읽는 라벨의 SSOT 는 app/features/refunds/lib/refund-status.ts 다.
alter table public.refunds drop constraint if exists refunds_status_check;
alter table public.refunds add constraint refunds_status_check check (status in (
  'received',        -- 환불접수
  'reviewing',       -- 검토중
  'need_info',       -- 추가확인 필요
  'awaiting_return', -- 반품대기
  'amount_fixed',    -- 환불금액 확정
  'pg_pending',      -- PG 취소대기
  'pg_done',         -- PG 취소완료·내부처리대기
  'partial_done',    -- 부분환불완료
  'full_done',       -- 전체환불완료
  'rejected',        -- 환불반려
  'withdrawn',       -- 환불철회
  'error'            -- 처리오류
));

alter table public.refunds drop constraint if exists refunds_intake_channel_check;
alter table public.refunds add constraint refunds_intake_channel_check
  check (intake_channel is null or intake_channel in ('phone','kakao','board','visit','etc'));

alter table public.refunds drop constraint if exists refunds_method_check;
alter table public.refunds add constraint refunds_method_check
  check (refund_method is null or refund_method in ('original','bank','etc'));

alter table public.refunds drop constraint if exists refunds_pg_kind_check;
alter table public.refunds add constraint refunds_pg_kind_check
  check (pg_cancel_kind is null or pg_cancel_kind in ('full','partial'));

-- 금액은 음수일 수 없다 — 요청서 §10 「이미 환불한 금액보다 큰 금액 입력 차단」의 바닥.
alter table public.refunds drop constraint if exists refunds_amounts_nonneg_check;
alter table public.refunds add constraint refunds_amounts_nonneg_check check (
  coalesce(original_paid_krw, 0)  >= 0 and
  coalesce(prior_refunded_krw, 0) >= 0 and
  coalesce(this_refund_krw, 0)    >= 0 and
  coalesce(pg_cancel_krw, 0)      >= 0
);

-- ★누적 환불이 최초 결제금액을 넘지 못한다(요청서 §10). 금액이 다 차 있을 때만 건다 —
--   접수 직후에는 this_refund_krw 가 비어 있고, 그때 막으면 접수 자체가 안 된다.
alter table public.refunds drop constraint if exists refunds_total_within_paid_check;
alter table public.refunds add constraint refunds_total_within_paid_check check (
  original_paid_krw is null or this_refund_krw is null
  or coalesce(prior_refunded_krw, 0) + this_refund_krw <= original_paid_krw
);

create index if not exists refunds_order_idx  on public.refunds (order_id);
create index if not exists refunds_user_idx   on public.refunds (user_id, created_at desc);
create index if not exists refunds_status_idx on public.refunds (status, created_at desc);
-- 미처리 배지(요청서 §3 「환불관리 ③」) — 열린 건만 세는 부분 인덱스.
create index if not exists refunds_open_idx on public.refunds (created_at desc)
  where closed_at is null;

comment on table public.refunds is
  'feat-11-013 P6 관리자 환불 접수·처리 헤더. 소유자=관리자, 상태 12값. 학생 소유 refund_requests 와 별개.';
comment on column public.refunds.prior_refunded_krw is
  '접수 시점의 기존 누적 환불액 스냅샷. 환불 후 누적·남은 가능금액은 파생이라 저장하지 않는다.';

-- ── 2. refund_items — 대상 ──────────────────────────────────────────────────
-- ★order_item_id 만 참조한다(course_id 아님). 패키지는 order_item 1행이라 쪼갤 수 없고,
--   그것이 요청서 11-9 「패키지 구성강좌 일부만 환불 불가」를 **구조로** 보장한다.
create table if not exists public.refund_items (
  refund_item_id       uuid primary key default gen_random_uuid(),
  refund_id            uuid not null references public.refunds(refund_id) on delete cascade,
  order_item_id        uuid not null references public.order_items(order_item_id) on delete cascade,
  quantity             integer not null default 1 check (quantity > 0),

  -- 환불금액 계산 (요청서 §7 「환불금액 계산」) — ★P6 은 칸만 만든다. 채우는 것은 P7 엔진이다.
  base_krw             integer,
  used_deduction_krw   integer,
  shipping_deduction_krw integer,
  other_deduction_krw  integer,
  deduction_reason     text,
  point_return_krw     integer,
  point_revoke_krw     integer,
  coupon_restored      boolean not null default false,
  final_krw            integer,
  calc_basis           jsonb,

  -- 교재 반품 (요청서 §9 「교재」)
  return_tracking_no   text,
  returned_at          timestamptz,

  -- ★열림 여부 — refunds.status 에서 트리거가 내려 유지한다. 아래 유니크 인덱스의 축이다.
  is_open              boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.refund_items drop constraint if exists refund_items_amounts_nonneg_check;
alter table public.refund_items add constraint refund_items_amounts_nonneg_check check (
  coalesce(base_krw, 0) >= 0 and coalesce(used_deduction_krw, 0) >= 0 and
  coalesce(shipping_deduction_krw, 0) >= 0 and coalesce(other_deduction_krw, 0) >= 0 and
  coalesce(point_return_krw, 0) >= 0 and coalesce(point_revoke_krw, 0) >= 0 and
  coalesce(final_krw, 0) >= 0
);

-- ★★요청서 §10 「동일 상품 중복 환불신청 차단」을 **DB 가** 지킨다.
--   한 주문항목에 **열린 환불건은 최대 하나**. 앞 건이 닫히면(완료·반려·철회) 추가환불이 열린다
--   — 요청서 §2 「1차 부분환불 후 남은 상품 추가환불」이 그래서 그대로 가능하다.
--   애플리케이션 카운트로 막지 않는다. 접수 화면과 API 가 동시에 들어오면 세는 쪽이 진다.
create unique index if not exists refund_items_open_uidx
  on public.refund_items (order_item_id) where is_open;
create index if not exists refund_items_refund_idx on public.refund_items (refund_id);

comment on table public.refund_items is
  'feat-11-013 P6 환불 대상 주문항목. 열린 건은 항목당 1개(refund_items_open_uidx).';

-- ── 3. refund_status_logs — 이력 (요청서 §8) ────────────────────────────────
create table if not exists public.refund_status_logs (
  log_id       uuid primary key default gen_random_uuid(),
  refund_id    uuid not null references public.refunds(refund_id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_id     uuid references public.profiles(profile_id),
  memo         text,
  created_at   timestamptz not null default now()
);
create index if not exists refund_status_logs_refund_idx
  on public.refund_status_logs (refund_id, created_at desc);

comment on table public.refund_status_logs is
  'feat-11-013 P6 환불 상태 변경 이력. append-only — 누가 언제 어떤 금액을 환불했는지의 근거(요청서 §10).';

-- ── 4. 트리거 — is_open · closed_at · updated_at · 상태 이력 ────────────────
create or replace function public.refunds_sync_closed()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_terminal boolean := new.status in ('partial_done','full_done','rejected','withdrawn');
begin
  new.updated_at := now();
  -- ★종결이면 닫고, 되돌아오면 다시 연다. 반려를 철회 취소로 되돌리는 운영이 실제로 있다.
  if v_terminal and new.closed_at is null then
    new.closed_at := now();
  elsif not v_terminal then
    new.closed_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists refunds_sync_closed_trg on public.refunds;
create trigger refunds_sync_closed_trg
  before insert or update on public.refunds
  for each row execute function public.refunds_sync_closed();

create or replace function public.refund_items_sync_open()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  -- ★`after update of closed_at` 로 걸지 않는다 — 그 형태는 **문장이 그 칼럼을 직접 쓸 때만**
  --   발화한다. closed_at 은 상태를 바꾼 BEFORE 트리거가 채우므로 발화하지 않고, 종결된 건의
  --   대상 항목이 열린 채 남아 다음 환불 접수가 영영 막힌다(예행 03·04 에서 실제로 잡혔다).
  if tg_op = 'UPDATE' and old.closed_at is not distinct from new.closed_at then
    return null;
  end if;
  -- 헤더가 닫히면 대상 항목도 닫는다 → 같은 주문항목에 다음 환불건을 열 수 있다.
  update public.refund_items
     set is_open = (new.closed_at is null), updated_at = now()
   where refund_id = new.refund_id
     and is_open is distinct from (new.closed_at is null);
  return null;
exception when unique_violation then
  -- ★되돌리기(반려 취소 등)가 막히는 유일한 경우 — 그 사이 **다른 환불건**이 같은 주문항목에
  --   열렸다. 막는 것이 맞다. 다만 원시 23505 가 관리자 화면에 그대로 뜨면 뜻이 통하지 않으므로
  --   여기서 말이 되는 문장으로 바꾼다.
  raise exception '이 주문항목에 진행 중인 다른 환불건이 있어 되돌릴 수 없습니다. 그 건을 먼저 종결해 주세요.'
    using errcode = 'REFND';
end;
$fn$;

drop trigger if exists refund_items_sync_open_trg on public.refunds;
create trigger refund_items_sync_open_trg
  after insert or update on public.refunds
  for each row execute function public.refund_items_sync_open();

-- ★상태 이력은 **트리거가 남긴다.** 호출부가 남기게 두면 SQL 로 직접 고친 한 건이
--   이력에서 통째로 빠지고, 그 한 건이 분쟁 때 필요한 바로 그 건이다(요청서 §10).
--   actor 는 세션의 auth.uid() — 서버 액션이 요청 클라이언트로 부르면 사람이 남고,
--   RPC·스윕이 service_role 로 부르면 null 이 남는다(그 자체가 「자동 처리」 표시).
create or replace function public.refunds_log_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, null, new.status, auth.uid(), '접수');
  elsif new.status is distinct from old.status then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, old.status, new.status, auth.uid(), null);
  end if;
  return null;
end;
$fn$;

drop trigger if exists refunds_log_status_trg on public.refunds;
create trigger refunds_log_status_trg
  after insert or update of status on public.refunds
  for each row execute function public.refunds_log_status();

create or replace function public.refund_items_touch()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists refund_items_touch_trg on public.refund_items;
create trigger refund_items_touch_trg
  before update on public.refund_items
  for each row execute function public.refund_items_touch();

-- ── 5. RLS — staff 읽기 전용, 쓰기는 서버(service_role)만 ───────────────────
-- ★학생 SELECT 를 열지 않는다. 상담내용·관리자 메모가 같은 행에 있고 RLS 는 행 단위라
--   정책을 열면 PostgREST 로 그 칸까지 읽힌다. 학생에게 보일 4개 항목(상태·금액·처리일·대상)은
--   P6-e 에서 서버 loader 가 골라 내려준다.
alter table public.refunds            enable row level security;
alter table public.refund_items       enable row level security;
alter table public.refund_status_logs enable row level security;

drop policy if exists refunds_select_staff on public.refunds;
create policy refunds_select_staff on public.refunds
  for select to authenticated using (private.is_staff((select auth.uid())));

drop policy if exists refund_items_select_staff on public.refund_items;
create policy refund_items_select_staff on public.refund_items
  for select to authenticated using (private.is_staff((select auth.uid())));

drop policy if exists refund_status_logs_select_staff on public.refund_status_logs;
create policy refund_status_logs_select_staff on public.refund_status_logs
  for select to authenticated using (private.is_staff((select auth.uid())));
