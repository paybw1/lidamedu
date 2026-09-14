-- feat-11-013 D15 롤백.
--
-- ★★주의 — 완전한 되돌리기가 아니다.
--   ① 'restore' 거래가 하나라도 있으면 kind CHECK 되돌리기가 **실패한다**(당연하다 —
--      이미 학생에게 돌려준 포인트를 표현할 칸이 사라지기 때문). 그 경우 롤백을 멈추고
--      그 행들을 어떻게 할지 먼저 정해야 한다. 임의로 지우지 마라 — **학생의 돈이다.**
--   ② orders.point_amount_krw 를 지우면 「얼마를 포인트로 냈는가」가 사라진다.
--      0 이 아닌 주문이 있으면 지우지 말고 컬럼만 남겨 둔다(기본값 0 이라 무해하다).

begin;

-- 5 → 쿠폰 교환을 잠금 없던 원래 모습으로. (권장하지 않는다 — 잠금이 없는 쪽이 결함이다)
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

-- 4, 3 → 새 RPC 제거
drop function if exists public.restore_points_for_order(uuid, text);
drop function if exists public.spend_points_for_order(uuid);

-- 2 → 멱등 인덱스 + kind CHECK
drop index if exists point_transactions_order_kind_uidx;

-- ★'restore' 행이 있으면 아래가 실패한다. 그게 옳다 — 조용히 넘어가면 안 된다.
alter table point_transactions
  drop constraint if exists point_transactions_kind_check;
alter table point_transactions
  add constraint point_transactions_kind_check
  check (kind = any (array['earn', 'spend', 'expire', 'revoke', 'manual']));

-- 1 → 주문 컬럼. ★0 이 아닌 주문이 있으면 이 줄을 실행하지 마라(위 주의 ② 참조).
alter table orders drop constraint if exists orders_point_amount_krw_check;
alter table orders drop column if exists point_amount_krw;

commit;
