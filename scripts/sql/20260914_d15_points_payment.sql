-- feat-11-013 D15 — 포인트 결제 (요청서 §11-11).
--
-- ★설계 근거는 docs/features/feat-11-013-course-types-and-refunds-260914.md 의 D15 절.
--   핵심: 토스는 confirm 에서 **돈을 가져간다.** 그 순간 잔액이 모자라면 되돌릴 수 없으므로
--   **주문 생성 시 예약(차감)** 하고 결제가 죽으면 되돌린다.
--
-- 1) orders.point_amount_krw — 주문 단위 포인트 사용액
-- 2) point_transactions.kind 에 'restore' 추가 — 되돌리는 **양(+)** 을 표현할 칸이 없었다
-- 3) RPC spend_points_for_order   — 예약(차감). 사용자 단위 잠금.
-- 4) RPC restore_points_for_order — 반환(+). 서버 전용.
-- 5) RPC exchange_points_for_coupon 교체 — ★같은 잠금을 걸지 않으면 쿠폰 교환이
--    주문 예약과 경합해 **둘 다 통과**할 수 있다(현행 결함).

begin;

-- ── 1. 주문 단위 포인트 사용액 ────────────────────────────────────────────────
alter table orders
  add column if not exists point_amount_krw integer not null default 0;

comment on column orders.point_amount_krw is
  '포인트 결제 사용액(원). 1P=1원. 주문 생성 시 예약되고 결제 실패 시 반환된다(feat-11-013 D15).';

alter table orders
  drop constraint if exists orders_point_amount_krw_check;
alter table orders
  add constraint orders_point_amount_krw_check check (point_amount_krw >= 0);

-- ── 2. 되돌리는 양을 표현할 kind ──────────────────────────────────────────────
-- ★현행 earn/spend/expire/revoke/manual 은 전부 「주거나(earn) 빼앗는(revoke)」 쪽이고,
--   **사용자가 쓴 것을 되돌려 주는** 양수 항목이 없다. revoke 는 음수 전용이다.
alter table point_transactions
  drop constraint if exists point_transactions_kind_check;
alter table point_transactions
  add constraint point_transactions_kind_check
  check (kind = any (array['earn', 'spend', 'expire', 'revoke', 'manual', 'restore']));

-- ★주문당 같은 종류의 포인트 거래는 하나뿐이어야 한다 — 웹훅 재전송·결제창 닫기가
--   겹쳐도 두 번 빠지거나 두 번 돌아오지 않게 하는 **DB 차원의 멱등성**이다.
--   애플리케이션 카운트로 막지 않는다(awardPoints 의 UNIQUE 인덱스와 같은 태도).
create unique index if not exists point_transactions_order_kind_uidx
  on point_transactions (order_id, kind)
  where order_id is not null and kind in ('spend', 'restore');

-- ── 3. 예약(차감) ─────────────────────────────────────────────────────────────
create or replace function public.spend_points_for_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user    uuid := (select auth.uid());
  v_order   record;
  v_balance integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', '로그인이 필요합니다.');
  end if;

  -- ★사용자 단위 직렬화. 잔액은 sum(delta) 라 잠글 행이 없다(아직 없는 행이 문제다).
  --   4242 = 포인트 네임스페이스. 쿠폰 교환도 **같은 키**를 쓴다.
  perform pg_advisory_xact_lock(4242, hashtext(v_user::text));

  select order_id, user_id, status, point_amount_krw
    into v_order
    from orders
   where order_id = p_order_id
   for update;

  if not found or v_order.user_id <> v_user then
    return jsonb_build_object('ok', false, 'error', '주문을 찾을 수 없습니다.');
  end if;

  if v_order.point_amount_krw <= 0 then
    return jsonb_build_object('ok', true, 'spent', 0);  -- 쓸 포인트가 없다 = 정상
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_user;

  -- 멱등 — 이미 예약된 주문이면 그대로 성공으로 돌려준다(재시도 안전).
  if exists (select 1 from point_transactions
              where order_id = p_order_id and kind = 'spend') then
    return jsonb_build_object('ok', true, 'spent', v_order.point_amount_krw,
                              'balance', v_balance, 'idempotent', true);
  end if;

  if v_balance < v_order.point_amount_krw then
    return jsonb_build_object('ok', false, 'error', '포인트가 부족합니다.',
                              'balance', v_balance, 'need', v_order.point_amount_krw);
  end if;

  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values
    (v_user, -v_order.point_amount_krw, '포인트 결제',
     v_balance - v_order.point_amount_krw, 'spend', 'order', p_order_id::text, p_order_id);

  return jsonb_build_object('ok', true, 'spent', v_order.point_amount_krw,
                            'balance', v_balance - v_order.point_amount_krw);
end;
$fn$;

-- ── 4. 반환 ───────────────────────────────────────────────────────────────────
-- ★서버 전용이다. 웹훅·스윕은 사용자 세션이 없어 auth.uid() 가 null 이므로
--   **주문 행에서 사용자를 읽는다.** 그래서 학생이 직접 부르면 안 된다 — 실행 권한을
--   service_role 로만 준다(아래 revoke/grant).
create or replace function public.restore_points_for_order(
  p_order_id uuid,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_spend   record;
  v_balance integer;
begin
  select user_id, delta into v_spend
    from point_transactions
   where order_id = p_order_id and kind = 'spend'
   limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'restored', 0);  -- 예약이 없었다 = 정상
  end if;

  perform pg_advisory_xact_lock(4242, hashtext(v_spend.user_id::text));

  -- 멱등 — 이미 되돌렸으면 다시 넣지 않는다(웹훅과 결제창 닫기가 둘 다 올 수 있다).
  if exists (select 1 from point_transactions
              where order_id = p_order_id and kind = 'restore') then
    return jsonb_build_object('ok', true, 'restored', 0, 'idempotent', true);
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_spend.user_id;

  -- v_spend.delta 는 음수(−사용액)다. 되돌릴 양은 그 부호를 뒤집은 값.
  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values
    (v_spend.user_id, -v_spend.delta, coalesce(p_reason, '포인트 결제 취소 — 반환'),
     v_balance - v_spend.delta, 'restore', 'order', p_order_id::text, p_order_id);

  return jsonb_build_object('ok', true, 'restored', -v_spend.delta,
                            'balance', v_balance - v_spend.delta);
end;
$fn$;

revoke execute on function public.restore_points_for_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.restore_points_for_order(uuid, text) to service_role;

-- ── 5. 쿠폰 교환에 같은 잠금 ──────────────────────────────────────────────────
-- ★현행은 사용자 단위 잠금이 없어 동시 요청 둘이 같은 sum(delta) 를 보고 **둘 다 통과**한다.
--   주문 예약과 쿠폰 교환이 동시에 오면 잔액이 음수가 될 수 있다. 본문은 그대로 두고
--   잠금 한 줄만 넣는다(feat-11-013 D15).
create or replace function public.exchange_points_for_coupon(p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
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

  -- ★feat-11-013 D15 에서 추가. spend_points_for_order 와 **같은 키**여야 의미가 있다.
  perform pg_advisory_xact_lock(4242, hashtext(v_user::text));

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

  -- ★유효한 보유분만 중복으로 본다. 만료분까지 세면 한 번 받은 쿠폰은 영영 못 받는다.
  if exists (
    select 1 from coupon_grants
     where coupon_id = v_offer.coupon_id
       and user_id = v_user
       and revoked_at is null
       and (expires_at is null or expires_at > now())
  ) then
    return jsonb_build_object('ok', false, 'error', '이미 보유 중인 쿠폰입니다.');
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
$fn$;

commit;
