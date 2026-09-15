-- 20260915_p8a_point_return_authority.sql 되돌리기.
--
-- ★되돌리면 부분 환불에서 포인트가 **다시 전액** 나간다(요청서 11-11 위반). 그리고
--   refund_item 축으로 이미 쌓인 restore 행이 있으면 인덱스 재생성이 실패할 수 있다 —
--   그 경우는 되돌리지 말고 앞으로 고쳐라. 확인: 아래 첫 쿼리.
--
--   select count(*) from point_transactions where ref_type = 'refund_item';

begin;

drop function if exists public.refund_points_for_order_item(uuid, text, integer, uuid);

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
    return jsonb_build_object('ok', true, 'refunded', 0);
  end if;

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

drop index if exists point_transactions_spend_restore_uidx;
create unique index point_transactions_spend_restore_uidx
  on public.point_transactions (kind, ref_type, ref_id)
  where kind in ('spend', 'restore') and ref_type in ('order', 'order_item');

drop index if exists point_transactions_order_item_idx;
alter table public.point_transactions drop column if exists order_item_id;

commit;
