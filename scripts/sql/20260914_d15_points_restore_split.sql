-- feat-11-013 D15 보정 — 「반환」은 성격이 다른 **두 연산**이다.
--
-- ★첫 판(20260914_d15_points_payment.sql)의 결함: 반환을 한 연산으로 보고
--   unique(order_id, kind) + 전액 부호반전으로 짰다. 그런데 실제 환불의 기본 단위는
--   **주문이 아니라 항목**이다(refundOrderItem). 그대로 두면 2항목 주문에서
--   ①1항목만 환불해도 포인트 **전액**이 돌아가고(학원 손해)
--   ②두 번째 항목 환불은 인덱스에 막혀 **한 푼도 안 돌아간다**(학생 손해).
--
--   예약해제 = 결제가 죽어서 **안 쓴 것을 무르는** 일 → 주문 단위, 전액, 1회
--   환불반환 = 이미 **쓴 것을 돌려주는** 일       → 항목 단위, 부분, 반복
--
-- 그래서 멱등 축을 (kind, ref_type, ref_id) 로 옮기고 RPC 를 둘로 가른다.

begin;

-- ── 1. 멱등 축 교체 ───────────────────────────────────────────────────────────
-- 종전: (order_id, kind)          — 주문당 restore 1행만 허용 → 항목 환불이 막힌다
-- 이후: (kind, ref_type, ref_id)  — 예약해제는 주문당 1행, 환불반환은 항목당 1행
drop index if exists point_transactions_order_kind_uidx;

create unique index if not exists point_transactions_spend_restore_uidx
  on point_transactions (kind, ref_type, ref_id)
  where kind in ('spend', 'restore') and ref_type in ('order', 'order_item');

-- ── 2. 예약 해제 — 주문 단위·전액·1회 ────────────────────────────────────────
drop function if exists public.restore_points_for_order(uuid, text);

create or replace function public.release_points_for_order(
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
  v_status  text;
  v_balance integer;
begin
  -- ★★결제된 주문에는 절대 걸면 안 된다 — 돈은 받고 포인트도 돌려주는 상태가 된다.
  --   결제창 닫기 신호와 승인 응답이 엇갈려 도착하는 일이 실제로 있다.
  select status into v_status from orders where order_id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', '주문을 찾을 수 없습니다.');
  end if;
  if v_status not in ('cancelled', 'expired', 'failed') then
    return jsonb_build_object('ok', false, 'error', '해제할 수 없는 주문 상태입니다.',
                              'status', v_status);
  end if;

  select user_id, delta into v_spend
    from point_transactions
   where kind = 'spend' and ref_type = 'order' and ref_id = p_order_id::text
   limit 1;

  -- ★예약이 없으면 되돌릴 것도 없다. 「restore 행이 없음」만 보고 넣으면
  --   **취한 적 없는 포인트를 돌려주게 된다.**
  if not found then
    return jsonb_build_object('ok', true, 'released', 0);
  end if;

  perform pg_advisory_xact_lock(4242, hashtext(v_spend.user_id::text));

  if exists (select 1 from point_transactions
              where kind = 'restore' and ref_type = 'order' and ref_id = p_order_id::text) then
    return jsonb_build_object('ok', true, 'released', 0, 'idempotent', true);
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_spend.user_id;

  -- v_spend.delta 는 음수(−사용액). 되돌릴 양은 부호를 뒤집은 값.
  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values
    (v_spend.user_id, -v_spend.delta, coalesce(p_reason, '결제 미완료 — 포인트 반환'),
     v_balance - v_spend.delta, 'restore', 'order', p_order_id::text, p_order_id);

  return jsonb_build_object('ok', true, 'released', -v_spend.delta,
                            'balance', v_balance - v_spend.delta);
end;
$fn$;

revoke execute on function public.release_points_for_order(uuid, text) from public, anon, authenticated;
grant  execute on function public.release_points_for_order(uuid, text) to service_role;

-- ── 3. 환불 반환 — 항목 단위·부분·반복 ───────────────────────────────────────
-- ★금액의 권위는 order_items.point_alloc_krw(P1 스냅샷)다. 인자로 받은 금액이
--   그 값을 넘으면 거절한다 — 호출부가 잘못 계산해도 원장이 먼저 막는다.
create or replace function public.refund_points_for_order_item(
  p_order_item_id uuid,
  p_reason        text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_item    record;
  v_user    uuid;
  v_balance integer;
begin
  select oi.order_item_id, oi.order_id, oi.point_alloc_krw, o.user_id
    into v_item
    from order_items oi
    join orders o on o.order_id = oi.order_id
   where oi.order_item_id = p_order_item_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', '주문 항목을 찾을 수 없습니다.');
  end if;
  if coalesce(v_item.point_alloc_krw, 0) <= 0 then
    return jsonb_build_object('ok', true, 'refunded', 0);  -- 포인트가 안 붙은 항목
  end if;

  -- 예약이 실제로 있었던 주문만. (포인트를 쓰지 않은 주문에 반환이 나가면 안 된다)
  if not exists (select 1 from point_transactions
                  where kind = 'spend' and ref_type = 'order'
                    and ref_id = v_item.order_id::text) then
    return jsonb_build_object('ok', true, 'refunded', 0);
  end if;

  v_user := v_item.user_id;
  perform pg_advisory_xact_lock(4242, hashtext(v_user::text));

  if exists (select 1 from point_transactions
              where kind = 'restore' and ref_type = 'order_item'
                and ref_id = p_order_item_id::text) then
    return jsonb_build_object('ok', true, 'refunded', 0, 'idempotent', true);
  end if;

  -- ★예약을 이미 통째로 해제한 주문이면(결제 실패분) 환불 반환을 또 하면 안 된다.
  if exists (select 1 from point_transactions
              where kind = 'restore' and ref_type = 'order'
                and ref_id = v_item.order_id::text) then
    return jsonb_build_object('ok', true, 'refunded', 0, 'already_released', true);
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_user;

  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values
    (v_user, v_item.point_alloc_krw, coalesce(p_reason, '환불 — 포인트 반환'),
     v_balance + v_item.point_alloc_krw, 'restore', 'order_item',
     p_order_item_id::text, v_item.order_id);

  return jsonb_build_object('ok', true, 'refunded', v_item.point_alloc_krw,
                            'balance', v_balance + v_item.point_alloc_krw);
end;
$fn$;

revoke execute on function public.refund_points_for_order_item(uuid, text) from public, anon, authenticated;
grant  execute on function public.refund_points_for_order_item(uuid, text) to service_role;

-- ── 4. ★자가치유 — 진짜 마지막 그물 ──────────────────────────────────────────
-- 전이 훅(결제창 닫기·웹훅·스윕)은 전부 「상태 전이」와 「포인트 반환」이 **트랜잭션이
-- 아닌 두 번의 쓰기**다. 스윕 도중 함수가 죽으면 주문은 이미 expired 라 다음 스윕이
-- 다시 집지 않는다 — 포인트가 영구히 묶인다.
-- 그래서 **상태를 보고 뒤늦게 줍는** 경로를 따로 둔다. 훅이 하나도 안 불려도 이게 줍는다.
create or replace function public.release_orphaned_point_reservations(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_order  record;
  v_count  integer := 0;
  v_sum    integer := 0;
  v_res    jsonb;
begin
  for v_order in
    select o.order_id
      from orders o
     where o.status in ('cancelled', 'expired', 'failed')
       and o.point_amount_krw > 0
       and exists (select 1 from point_transactions t
                    where t.kind = 'spend' and t.ref_type = 'order'
                      and t.ref_id = o.order_id::text)
       and not exists (select 1 from point_transactions t
                        where t.kind = 'restore' and t.ref_type = 'order'
                          and t.ref_id = o.order_id::text)
     order by o.created_at
     limit greatest(1, least(p_limit, 1000))
  loop
    v_res := public.release_points_for_order(v_order.order_id, '미반환 예약 자동 회수');
    if (v_res->>'ok')::boolean and coalesce((v_res->>'released')::integer, 0) > 0 then
      v_count := v_count + 1;
      v_sum := v_sum + (v_res->>'released')::integer;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'orders', v_count, 'points', v_sum);
end;
$fn$;

revoke execute on function public.release_orphaned_point_reservations(integer) from public, anon, authenticated;
grant  execute on function public.release_orphaned_point_reservations(integer) to service_role;

commit;
