-- feat-11-011 — 포인트 정책 (요청서: source/학습플랫폼/리담변리사학원 포인트정책.html)
--
-- 구 플랫폼의 적립 정책 13종을 그대로 옮긴다. 정책을 새로 만드는 게 아니라
-- **정해진 13종의 적립량·적립한도·사용여부를 운영자가 고치는** 구조다(요청서 '참고').
-- 사용처는 결제 차감이 아니라 **쿠폰 교환**이다 — 운영자가 교환 가능한 쿠폰을 등록하면
-- 회원이 마이페이지에서 포인트로 바꾼다.
--
-- ★지금 point_transactions 는 0건이다. 칸을 늘릴 수 있는 유일하게 안전한 시점이다.

-- ── 1. 적립 정책 ────────────────────────────────────────────────────────────
create table if not exists public.point_policies (
  policy_key  text primary key,
  label       text not null,
  criteria    text not null,
  -- fixed = 정액 포인트 / percent = 결제액 비율
  award_type  text not null check (award_type in ('fixed', 'percent')),
  award_value numeric(10, 2) not null check (award_value >= 0),
  -- once = 평생 1회 / every = 매번(대상당 최초 1회) / daily = 하루 daily_cap 회
  limit_kind  text not null check (limit_kind in ('once', 'every', 'daily')),
  daily_cap   integer check (daily_cap is null or daily_cap > 0),
  is_active   boolean not null default false,
  -- ★적립 훅이 코드에 연결돼 있는가. false 인 정책은 켜도 적립되지 않는다(화면에 표시).
  hook_ready  boolean not null default false,
  sort_order  integer not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(profile_id) on delete set null
);

alter table public.point_policies enable row level security;
drop policy if exists point_policies_read on public.point_policies;
create policy point_policies_read on public.point_policies for select using (true);
drop policy if exists point_policies_staff_write on public.point_policies;
create policy point_policies_staff_write on public.point_policies for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

-- 요청서의 표 그대로. 활성 4종(회원가입·강의학습완료·수강후기·도서후기)만 사용여부 on.
insert into public.point_policies
  (policy_key, label, criteria, award_type, award_value, limit_kind, daily_cap, is_active, hook_ready, sort_order)
values
  ('login',            '로그인',       '로그인 성공 시 포인트 부과',                              'fixed',   10, 'daily', 1, false, false,  1),
  ('signup',           '회원가입',     '회원가입 시 포인트 부과',                                 'fixed', 5000, 'once',  null, true,  true,   2),
  ('payment_complete', '결제완료',     '결제 시 결제액의 일정 비율만큼 포인트 부과',              'percent', 0.5, 'every', null, false, true,   3),
  ('lesson_complete',  '강의학습완료', '강의 학습 완료 시 포인트 부과 (차시당 최초 1회)',         'fixed',  200, 'every', null, true,  true,   4),
  ('course_complete',  '과정수료',     '과정 수료 시 포인트 부과 (과정당 최초 1회)',              'fixed',   10, 'every', null, false, false,  5),
  ('course_review',    '수강후기등록', '수강후기 등록 시 포인트 부과 (과정당 최초 1회)',          'fixed', 1000, 'daily', 1, true,  true,   6),
  ('survey',           '설문참여',     '설문 참여 시 포인트 부과 (동일 설문 최초 1회)',           'fixed',   10, 'every', null, false, false,  7),
  ('exam_submit',      '시험제출',     '시험 제출 시 포인트 부과 (동일 시험 최초 1회)',           'fixed',   10, 'every', null, false, false,  8),
  ('assignment_submit','과제제출',     '과제 제출 시 포인트 부과 (동일 과제 최초 1회)',           'fixed',   10, 'every', null, false, false,  9),
  ('discussion_submit','토론제출',     '토론 제출 시 포인트 부과 (동일 토론 최초 1회)',           'fixed',   10, 'every', null, false, false, 10),
  ('post_write',       '게시글작성',   '포인트 부여 설정이 되어 있는 게시판에 글 작성 시 포인트 부여', 'fixed', 1, 'daily', 5, false, false, 11),
  ('book_review',      '도서후기등록', '도서후기 등록 시 포인트 부과 (주문항목당 최초 1회)',      'fixed',  500, 'daily', 1, true,  true,  12),
  ('product_review',   '상품후기등록', '상품후기 등록 시 포인트 부과 (주문항목당 최초 1회)',      'fixed',   10, 'daily', 5, false, false, 13)
on conflict (policy_key) do nothing;

-- ── 2. 원장(point_transactions) 확장 ────────────────────────────────────────
alter table public.point_transactions
  add column if not exists kind       text not null default 'manual',
  add column if not exists policy_key text references public.point_policies(policy_key) on delete set null,
  add column if not exists ref_type   text,
  add column if not exists ref_id     text,
  add column if not exists order_id   uuid references public.orders(order_id) on delete set null,
  add column if not exists actor_id   uuid references public.profiles(profile_id) on delete set null,
  add column if not exists note       text;

alter table public.point_transactions drop constraint if exists point_transactions_kind_check;
alter table public.point_transactions add constraint point_transactions_kind_check
  check (kind in ('earn', 'spend', 'expire', 'revoke', 'manual'));

-- ★같은 대상에 두 번 적립되지 않게. 훅이 재실행돼도(웹훅 중복·새로고침) 한 번만 들어간다.
create unique index if not exists point_txn_policy_ref_uidx
  on public.point_transactions (user_id, policy_key, ref_type, ref_id)
  where policy_key is not null and ref_id is not null;

create index if not exists point_txn_user_created_idx
  on public.point_transactions (user_id, created_at desc);

-- ── 3. 쿠폰 전환 ────────────────────────────────────────────────────────────
-- ★coupon_grants 에 UNIQUE(coupon_id, user_id) 가 있어 한 쿠폰은 1인 1회만 보유한다.
--   따라서 교환 횟수 제한을 따로 두지 않는다(구조가 이미 1회로 강제한다).
create table if not exists public.point_coupon_offers (
  offer_id   uuid primary key default gen_random_uuid(),
  coupon_id  uuid not null unique references public.coupons(coupon_id) on delete cascade,
  point_cost integer not null check (point_cost > 0),
  stock      integer check (stock is null or stock >= 0), -- null = 무제한
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.point_coupon_offers enable row level security;
drop policy if exists point_coupon_offers_read on public.point_coupon_offers;
create policy point_coupon_offers_read on public.point_coupon_offers for select
  using (deleted_at is null and (is_active or private.is_staff((select auth.uid()))));
drop policy if exists point_coupon_offers_staff_write on public.point_coupon_offers;
create policy point_coupon_offers_staff_write on public.point_coupon_offers for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

-- ── 4. 교환 (원자적) ────────────────────────────────────────────────────────
-- 포인트 차감과 쿠폰 발급은 반드시 한 트랜잭션이어야 한다. 애플리케이션에서 두 번
-- 호출하면 그 사이에 끊겼을 때 포인트만 사라지거나 쿠폰만 생긴다.
create or replace function public.exchange_points_for_coupon(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := (select auth.uid());
  v_offer   record;
  v_balance integer;
  v_granted integer;
  v_expires timestamptz;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;

  select o.offer_id, o.coupon_id, o.point_cost, o.stock, o.is_active,
         c.name as coupon_name, c.usable_days, c.status as coupon_status
    into v_offer
    from point_coupon_offers o
    join coupons c on c.coupon_id = o.coupon_id
   where o.offer_id = p_offer_id and o.deleted_at is null and c.deleted_at is null
   for update of o;

  if not found or not v_offer.is_active or v_offer.coupon_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', '지금은 교환할 수 없는 쿠폰입니다.');
  end if;

  if exists (
    select 1 from coupon_grants
     where coupon_id = v_offer.coupon_id and user_id = v_user and revoked_at is null
  ) then
    return jsonb_build_object('ok', false, 'error', '이미 교환한 쿠폰입니다.');
  end if;

  if v_offer.stock is not null then
    select count(*) into v_granted
      from coupon_grants
     where coupon_id = v_offer.coupon_id and revoked_at is null;
    if v_granted >= v_offer.stock then
      return jsonb_build_object('ok', false, 'error', '교환 수량이 모두 소진되었습니다.');
    end if;
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_user;
  if v_balance < v_offer.point_cost then
    return jsonb_build_object('ok', false, 'error', '포인트가 부족합니다.',
                              'balance', v_balance, 'need', v_offer.point_cost);
  end if;

  v_expires := case when v_offer.usable_days is null then null
                    else now() + (v_offer.usable_days || ' days')::interval end;

  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id)
  values
    (v_user, -v_offer.point_cost, '쿠폰 교환 — ' || v_offer.coupon_name,
     v_balance - v_offer.point_cost, 'spend', 'coupon_offer', p_offer_id::text);

  insert into coupon_grants (coupon_id, user_id, granted_by, expires_at, note)
  values (v_offer.coupon_id, v_user, null, v_expires, '포인트 교환');

  return jsonb_build_object('ok', true, 'coupon', v_offer.coupon_name,
                            'spent', v_offer.point_cost,
                            'balance', v_balance - v_offer.point_cost);
end;
$$;

revoke all on function public.exchange_points_for_coupon(uuid) from public, anon;
grant execute on function public.exchange_points_for_coupon(uuid) to authenticated;
