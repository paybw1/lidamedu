-- 포인트 쿠폰 교환 — 만료된 보유분이 재교환을 영구히 막던 문제.
--
-- 증상(2026-09-04 신고): 잔액 100,000P · 30,000P 쿠폰인데 교환 버튼이 비활성.
-- 원인: 중복 검사가 coupon_grants 를 revoked_at 만 보고 판단했다. 2026-07-15 에 발급돼
--       2026-08-14 에 만료된 쿠폰이 남아 있어 "이미 교환한 쿠폰"으로 걸렸다.
--       만료된 쿠폰은 쓸 수도 없는데 재교환도 못 하는 상태가 된다.
-- 조치: 중복 검사에서 **유효한 보유분만** 본다(expires_at 이 지난 건 제외).
--       재고(stock) 계산은 그대로 전량을 센다 — 발급된 사실 자체는 소진이다.

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
$$;

revoke all on function public.exchange_points_for_coupon(uuid) from public, anon;
grant execute on function public.exchange_points_for_coupon(uuid) to authenticated;
