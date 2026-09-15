begin;

-- ── 1. 항목 식별자 ───────────────────────────────────────────────────────────
-- 「이 주문항목으로 이미 얼마를 돌려줬나」를 세기 위한 칸. ref_id 로는 셀 수 없다 —
-- 환불 반환 행은 축이 refund_item 이라 ref_id 가 환불항목 id 이기 때문이다.
alter table public.point_transactions
  add column if not exists order_item_id uuid references public.order_items(order_item_id);

-- 기존 항목 단위 반환 행 백필(오늘 0행이지만, 나중에 세는 쪽이 조건 없이 믿을 수 있게).
update public.point_transactions
   set order_item_id = ref_id::uuid
 where kind = 'restore' and ref_type = 'order_item'
   and order_item_id is null
   and ref_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

create index if not exists point_transactions_order_item_idx
  on public.point_transactions (order_item_id)
  where order_item_id is not null;

-- ── 2. 멱등 축에 refund_item 추가 ────────────────────────────────────────────
-- 예약 해제 = 주문당 1행(order) / 전량 환불 = 항목당 1행(order_item) /
-- 환불건별 반환 = **환불항목당 1행**(refund_item). 셋이 같은 인덱스를 공유한다.
drop index if exists point_transactions_spend_restore_uidx;

create unique index point_transactions_spend_restore_uidx
  on public.point_transactions (kind, ref_type, ref_id)
  where kind in ('spend', 'restore')
    and ref_type in ('order', 'order_item', 'refund_item');

-- ── 3. 반환 RPC — 상한과 환불건 축을 받는다 ──────────────────────────────────
-- ★인자를 **안 주면 종전과 똑같이** 동작한다(전액·order_item 축). 그래서 TS 의 전량 환불
--   경로 두 곳(refundOrderItem · markOrderRefundedAndRevoke)은 호출부를 고치지 않는다.
--   부분 환불을 아는 곳(commit_refund)만 상한(refund_items.point_return_krw)과
--   환불항목 id 를 넘긴다.
-- ★금액의 **최종 권위는 여전히 order_items.point_alloc_krw** 다. 상한은 그 아래로만
--   내릴 수 있고, 이미 돌려준 몫은 빠진다. 호출부가 잘못 계산해도 원장이 먼저 막는다.
drop function if exists public.refund_points_for_order_item(uuid, text);

create or replace function public.refund_points_for_order_item(
  p_order_item_id  uuid,
  p_reason         text    default null,
  p_max_krw        integer default null,
  p_refund_item_id uuid    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_item      record;
  v_user      uuid;
  v_balance   integer;
  v_returned  integer;
  v_remaining integer;
  v_amount    integer;
  v_ref_type  text;
  v_ref_id    text;
begin
  if p_max_krw is not null and p_max_krw < 0 then
    return jsonb_build_object('ok', false, 'error', '반환 상한이 음수입니다.');
  end if;

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

  -- 멱등 축 — 환불건을 받으면 그 환불 1행, 아니면 종전처럼 항목 1행.
  v_ref_type := case when p_refund_item_id is not null then 'refund_item' else 'order_item' end;
  v_ref_id   := coalesce(p_refund_item_id, p_order_item_id)::text;

  if exists (select 1 from point_transactions
              where kind = 'restore' and ref_type = v_ref_type and ref_id = v_ref_id) then
    return jsonb_build_object('ok', true, 'refunded', 0, 'idempotent', true);
  end if;

  -- ★예약을 이미 통째로 해제한 주문이면(결제 실패분) 환불 반환을 또 하면 안 된다.
  if exists (select 1 from point_transactions
              where kind = 'restore' and ref_type = 'order'
                and ref_id = v_item.order_id::text) then
    return jsonb_build_object('ok', true, 'refunded', 0, 'already_released', true);
  end if;

  -- ★잔여 = 배분액 − 이 항목으로 이미 돌려준 합계(order_item·refund_item 두 축 모두).
  select coalesce(sum(delta), 0) into v_returned
    from point_transactions
   where kind = 'restore' and order_item_id = p_order_item_id;
  v_remaining := greatest(0, coalesce(v_item.point_alloc_krw, 0) - v_returned);

  v_amount := least(v_remaining, coalesce(p_max_krw, v_remaining));
  if v_amount <= 0 then
    -- 상한이 0 이거나 잔여가 없다 — 오류가 아니다(요청서 11-11 에서 MIN 이 0 일 수 있다).
    return jsonb_build_object('ok', true, 'refunded', 0, 'remaining', v_remaining);
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from point_transactions where user_id = v_user;

  insert into point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id, order_item_id)
  values
    (v_user, v_amount, coalesce(p_reason, '환불 — 포인트 반환'),
     v_balance + v_amount, 'restore', v_ref_type, v_ref_id, v_item.order_id, p_order_item_id);

  return jsonb_build_object('ok', true, 'refunded', v_amount,
                            'remaining', v_remaining - v_amount,
                            'balance', v_balance + v_amount);
end;
$fn$;

revoke execute on function public.refund_points_for_order_item(uuid, text, integer, uuid)
  from public, anon, authenticated;
grant  execute on function public.refund_points_for_order_item(uuid, text, integer, uuid)
  to service_role;

-- ── 4. commit_refund — 상한·환불건 축을 넘긴다 ───────────────────────────────
-- ★라이브 정의(pg_get_functiondef)를 그대로 떠서 **세 곳만** 고쳤다.
--   ① 확정 전 가드(포인트 있는데 반환액 미확정 → 거절)
--   ② 루프 select 에 refund_item_id · point_return_krw 추가
--   ③ RPC 호출에 상한·환불건 전달
CREATE OR REPLACE FUNCTION public.commit_refund(p_refund_id uuid, p_actor_id uuid, p_memo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_r          public.refunds%rowtype;
  v_order_id   uuid;
  v_items_sum  integer := 0;
  v_missing    integer := 0;
  v_partialqty integer := 0;
  v_count      integer := 0;
  v_foreign    integer := 0;
  v_overpaid   integer := 0;
  v_live_prior integer := 0;
  v_ship_fee   integer := 0;
  v_ship_prior integer := 0;
  v_claim      integer := 0;
  v_point_back integer := 0;
  v_revoked    integer := 0;
  v_shortfall  integer := 0;
  v_coupon     integer := 0;
  v_earned     integer := 0;
  v_balance    integer := 0;
  v_target     text;
  v_remaining  integer;
  v_reason     text;
  rec          record;
  res          jsonb;
begin
  -- ★잠금 먼저 — 두 관리자가 같은 건의 [환불완료]를 동시에 누르는 일이 실제로 있다.
  select * into v_r from public.refunds where refund_id = p_refund_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', '환불건을 찾을 수 없습니다.');
  end if;

  -- 멱등 — 이미 종결이면 아무것도 하지 않는다. 웹훅 재전송·더블클릭이 여기로 들어온다.
  if v_r.status in ('partial_done', 'full_done') then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_r.status);
  end if;
  if v_r.status <> 'pg_done' then
    return jsonb_build_object('ok', false,
      'error', 'PG 취소완료 상태에서만 환불을 확정할 수 있습니다.');
  end if;

  -- 요청서 §6 — 토스 취소결과 4값이 없으면 환불완료 처리 불가.
  if v_r.pg_cancel_krw is null or v_r.pg_cancel_krw <= 0
     or v_r.pg_cancelled_at is null
     or coalesce(btrim(v_r.pg_transaction_no), '') = ''
     or v_r.pg_operator is null then
    return jsonb_build_object('ok', false,
      'error', '토스 취소금액·취소일시·거래번호·처리담당자를 모두 입력해야 환불완료로 처리할 수 있습니다.');
  end if;

  -- ★매출·정산에 들어가는 것은 **실제 취소금액**이다(요청서 §9). 확정액과 어긋나면 멈춘다 —
  --   여기서 통과시키면 장부와 PG 가 영영 다른 말을 한다.
  if v_r.this_refund_krw is null or v_r.this_refund_krw <= 0 then
    return jsonb_build_object('ok', false, 'error', '환불금액이 확정되지 않았습니다.');
  end if;
  if v_r.pg_cancel_krw <> v_r.this_refund_krw then
    return jsonb_build_object('ok', false, 'error',
      format('확정 환불금액 %s원과 실제 취소금액 %s원이 다릅니다. 금액을 맞춘 뒤 확정해 주세요.',
             to_char(v_r.this_refund_krw, 'FM999,999,999'),
             to_char(v_r.pg_cancel_krw, 'FM999,999,999')));
  end if;

  -- 대상 항목 검사 — 금액 미입력 / 수량 일부 환불 / 다른 주문 항목 섞임.
  v_order_id := v_r.order_id;
  select count(*),
         count(*) filter (where ri.final_krw is null),
         count(*) filter (where ri.quantity < oi.quantity),
         count(*) filter (where oi.order_id <> v_order_id),
         -- ★항목별 상한 — 그 항목에 실제로 결제된 금액을 넘겨 돌려줄 수는 없다.
         count(*) filter (
           where ri.final_krw > coalesce(oi.paid_amount_krw, oi.unit_price_krw * oi.quantity)),
         coalesce(sum(ri.final_krw), 0)
    into v_count, v_missing, v_partialqty, v_foreign, v_overpaid, v_items_sum
    from public.refund_items ri
    join public.order_items oi using (order_item_id)
   where ri.refund_id = p_refund_id;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', '환불 대상 상품이 없습니다.');
  end if;
  if v_foreign > 0 then
    return jsonb_build_object('ok', false, 'error', '다른 주문의 상품이 섞여 있습니다.');
  end if;
  if v_missing > 0 then
    return jsonb_build_object('ok', false, 'error', '상품별 환불금액이 입력되지 않은 항목이 있습니다.');
  end if;
  -- ★수량 일부 환불(교재)은 아직 지원하지 않는다 — order_items 에 환불 수량 칸이 없어
  --   「3권 중 1권 환불」을 기록할 자리가 없다. 조용히 전량 환불로 처리하면 학원이 손해를
  --   본다. P7(금액 계산)에서 칸과 함께 연다.
  if v_partialqty > 0 then
    return jsonb_build_object('ok', false,
      'error', '수량 일부 환불은 아직 지원하지 않습니다. 해당 상품은 전량으로 처리해 주세요.');
  end if;
  if v_overpaid > 0 then
    return jsonb_build_object('ok', false,
      'error', '상품별 환불금액이 그 상품의 실제 결제금액을 넘습니다.');
  end if;
  -- ★배송비 환불 상한 (P7-핸드오프 ①) — 이 주문의 배송비에서 이미 돌려준 몫을 뺀 만큼만.
  --   배송비는 order_items 가 아니라 주문 헤더에 있어 refund_items 로는 표현할 수 없다.
  --   그래서 refunds.shipping_refund_krw 한 칸을 둔다. 여기를 안 열면 배송비가 붙은 주문은
  --   전액을 돌려줘도 배송비만큼 잔여가 남아 full_done 에 영영 닿지 못한다.
  select coalesce(o.shipping_fee_krw, 0) into v_ship_fee
    from public.orders o where o.order_id = v_order_id;
  select coalesce(sum(r2.shipping_refund_krw), 0) into v_ship_prior
    from public.refunds r2
   where r2.order_id = v_order_id
     and r2.status in ('partial_done', 'full_done')
     and r2.refund_id <> p_refund_id;
  if coalesce(v_r.shipping_refund_krw, 0) < 0
     or coalesce(v_r.shipping_refund_krw, 0) > v_ship_fee - v_ship_prior then
    return jsonb_build_object('ok', false, 'error',
      format('환불할 수 있는 배송비는 %s원입니다.',
             to_char(greatest(v_ship_fee - v_ship_prior, 0), 'FM999,999,999')));
  end if;

  -- 확정 환불금액 = 상품별 합계 + 배송비 환불분.
  v_claim := v_items_sum + coalesce(v_r.shipping_refund_krw, 0);
  if v_claim <> v_r.this_refund_krw then
    return jsonb_build_object('ok', false, 'error',
      format('상품별 환불금액 합계 %s원(배송비 %s원 포함)이 확정 환불금액 %s원과 다릅니다.',
             to_char(v_claim, 'FM999,999,999'),
             to_char(coalesce(v_r.shipping_refund_krw, 0), 'FM999,999,999'),
             to_char(v_r.this_refund_krw, 'FM999,999,999')));
  end if;

  -- 요청서 §10 — 최초 결제금액을 초과하는 누적 환불 차단(DB 제약이 이미 막지만,
  -- 여기서 **말이 되는 문장**으로 먼저 돌려준다).
  -- ★`prior_refunded_krw` 는 **접수 시점 스냅샷**이라 여기서 믿으면 안 된다. 같은 주문에
  --   서로 다른 항목으로 환불건 둘을 동시에 열 수 있고(설계상 허용), 그러면 둘 다 prior=0 을
  --   들고 있다 — 각자 전액까지 청구해 **상한이 뚫린다.** 확정 시점에 **다시 센다.**
  --   스냅샷 칸은 접수 당시를 보여 주는 감사 기록으로 남긴다.
  select coalesce(sum(this_refund_krw), 0) into v_live_prior
    from public.refunds
   where order_id = v_order_id
     and status in ('partial_done', 'full_done')
     and refund_id <> p_refund_id;
  v_remaining := coalesce(v_r.original_paid_krw, 0) - v_live_prior;
  if v_r.original_paid_krw is not null and v_r.this_refund_krw > v_remaining then
    return jsonb_build_object('ok', false, 'error',
      format('남은 환불 가능금액은 %s원입니다.', to_char(v_remaining, 'FM999,999,999')));
  end if;

  -- ★포인트로 결제한 항목은 **반환액이 확정돼 있어야** 확정할 수 있다(P8-a).
  --   요청서 11-11 의 공식은 MIN(사용 포인트, 환불 대상금액)이라 「전액」이 답이 아니다.
  --   여기서 폴백하면 안 된다 —
  --     · 전액 폴백 = 고치려던 그 버그(부분 환불인데 포인트가 통째로 나간다)
  --     · final_krw 로 유도 = 그 칸은 **PG 평면**이라 학생이 받는 총액이 아니다
  --   그래서 반쪽으로 열지 않고 막고, 관리자가 [자동계산] 또는 포인트 반환액 입력으로
  --   값을 정하게 한다(요청서 11-15 「화면 표시값과 DB 저장값이 반드시 일치」).
  if exists (
    select 1
      from public.refund_items ri
      join public.order_items oi using (order_item_id)
     where ri.refund_id = p_refund_id
       and coalesce(oi.point_alloc_krw, 0) > 0
       and ri.point_return_krw is null
  ) then
    return jsonb_build_object('ok', false, 'error',
      '포인트로 결제한 항목이 있습니다. 포인트 반환액을 먼저 확정해 주세요.');
  end if;

  -- 이력에 남길 행위자·메모.
  -- ★NULL 을 그대로 넘기면 set_config 가 거부한다. 웹훅·스윕처럼 **사람이 없는 호출**이
  --   실제로 있으므로 빈 문자열로 떨어뜨리고, 트리거가 nullif 로 되돌린다.
  perform set_config('app.refund_actor', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.refund_memo', coalesce(p_memo, '환불 확정'), true);
  v_reason := coalesce(nullif(btrim(v_r.request_reason), ''), '환불');

  -- ── 항목 환불 기록 + 결제 포인트 반환 ────────────────────────────────────
  for rec in
    select ri.order_item_id, ri.refund_item_id, ri.final_krw, ri.point_return_krw,
           oi.unit_price_krw, oi.quantity,
           oi.paid_amount_krw, oi.coupon_alloc_krw, oi.point_alloc_krw, oi.refunded_at
      from public.refund_items ri
      join public.order_items oi using (order_item_id)
     where ri.refund_id = p_refund_id
  loop
    if rec.refunded_at is null then
      -- ★정가 평면으로 기록한다(P6-0). 정산 3파일이 이 평면을 읽는다.
      --   ※실환불액(final_krw)은 **할인 후 평면**이므로 정가 평면으로 환산해 넣는다.
      --     안 하면 10,000원짜리 항목을 8,000원만 환불해도 정산은 전액 환불로 읽어
      --     (settlement-sources.server.ts 의 scaleRefund) 강사 정산에서만 통째로 빠진다.
      --     결제귀속액(paid_amount_krw)이 없는 옛 주문은 정가로 폴백 — 환산이 항등식이 된다.
      update public.order_items
         set refunded_at = now(),
             refund_amount_krw = case
               when coalesce(rec.paid_amount_krw,
                        rec.unit_price_krw * rec.quantity
                          - coalesce(rec.coupon_alloc_krw, 0) - coalesce(rec.point_alloc_krw, 0)) > 0
               then round(
                      coalesce(rec.final_krw, 0)::numeric
                      * (rec.unit_price_krw * rec.quantity)
                      / coalesce(rec.paid_amount_krw,
                        rec.unit_price_krw * rec.quantity
                          - coalesce(rec.coupon_alloc_krw, 0) - coalesce(rec.point_alloc_krw, 0)))
               else 0
             end,
             refund_reason = v_reason
       where order_item_id = rec.order_item_id;
    end if;
    -- 결제에 쓴 포인트 반환 — **상한**은 이 환불건이 확정한 반환액(refund_items.point_return_krw,
    -- 요청서 11-11 의 MIN 공식 결과)이고, **최종 권위**는 여전히 order_items.point_alloc_krw 다
    -- (RPC 가 그 아래로만 내려가게 막고, 이미 돌려준 몫을 뺀다).
    -- 멱등 축은 **환불항목**이다 — 같은 주문항목을 순차로 여러 번 환불할 수 있어서
    -- (refund_items_open_uidx 는 열린 건에만 유일), 항목당 1행으로 묶으면 두 번째 환불에서
    -- 남은 포인트를 영영 못 돌려준다.
    v_point_back := v_point_back + coalesce(
      (public.refund_points_for_order_item(
         rec.order_item_id, '환불 — ' || v_reason,
         rec.point_return_krw, rec.refund_item_id)->>'refunded')::integer, 0);
  end loop;

  -- ── 적립 포인트 회수 (요청서 §9) ─────────────────────────────────────────
  -- ★결제로 적립된 몫을 이번 환불 비율만큼 되돌린다. 지금은 payment_complete 정책이
  --   꺼져 있어 적립 행이 없고, 이 가지는 no-op 이다.
  select coalesce(sum(delta), 0) into v_earned
    from public.point_transactions
   where user_id = v_r.user_id and kind = 'earn'
     and policy_key = 'payment_complete' and ref_type = 'order' and ref_id = v_order_id::text;

  if v_earned > 0 and coalesce(v_r.original_paid_krw, 0) > 0 then
    v_revoked := round(v_earned::numeric * v_r.this_refund_krw / v_r.original_paid_krw);
    select coalesce(sum(delta), 0) into v_balance
      from public.point_transactions where user_id = v_r.user_id;
    -- ★잔액보다 많이 회수하지 않는다 — 마이너스 잔액을 만들면 그 학생의 모든 포인트 계산이
    --   깨진다. 못 거둔 몫은 경고로 돌려준다(요청서 §9 「회수 포인트 부족 시 관리자 경고」).
    if v_revoked > v_balance then
      v_shortfall := v_revoked - greatest(v_balance, 0);
      v_revoked := greatest(v_balance, 0);
    end if;
    if v_revoked > 0 then
      insert into public.point_transactions
        (user_id, delta, reason, balance_after, kind, policy_key, ref_type, ref_id, actor_id, order_id)
      values (v_r.user_id, -v_revoked, '환불로 적립 회수 — ' || v_reason, v_balance - v_revoked,
              'revoke', 'payment_complete', 'refund:revoke', p_refund_id::text, p_actor_id, v_order_id)
      on conflict do nothing;
    end if;
  end if;

  -- ── 쿠폰 복원 (요청서 §9) ────────────────────────────────────────────────
  -- 전액 환불이고 관리자가 복원을 선택했을 때만 무른다.
  if v_r.coupon_restored
     and v_r.original_paid_krw is not null
     and v_live_prior + v_r.this_refund_krw = v_r.original_paid_krw then
    update public.coupon_redemptions
       set revoked_at = now(), revoke_reason = '환불 — ' || v_reason
     where order_id = v_order_id and revoked_at is null;
    get diagnostics v_coupon = row_count;
  end if;

  -- ── 주문 상태 ────────────────────────────────────────────────────────────
  update public.orders
     set status = case when exists (
                         select 1 from public.order_items
                          where order_id = v_order_id and refunded_at is null)
                       then 'partially_refunded' else 'refunded' end,
         updated_at = now()
   where order_id = v_order_id;

  -- ── 환불건 종결 ──────────────────────────────────────────────────────────
  -- ★전체/부분은 고르는 값이 아니라 금액에서 나온다(TS 상태기계와 같은 규칙).
  v_target := case
    when v_r.original_paid_krw is not null
     and v_live_prior + v_r.this_refund_krw = v_r.original_paid_krw
    then 'full_done' else 'partial_done' end;
  update public.refunds set status = v_target where refund_id = p_refund_id;

  res := jsonb_build_object(
    'ok', true, 'status', v_target, 'orderId', v_order_id,
    'pointReturned', v_point_back, 'pointRevoked', v_revoked,
    'pointRevokeShortfall', v_shortfall, 'couponRestored', v_coupon);
  return res;
end;
$function$
;

-- P8-a 리허설 본문 — 예외로 전부 롤백된다.
-- 주문: 정가 100,000 · 포인트 30,000 · 카드 70,000
do $do$
declare
  v_user  uuid := 'e20ac99a-bfa6-4862-94dd-23c063189463'::uuid;
  v_book  uuid;
  v_order uuid;
  v_item  uuid;
  v_r1    uuid;
  v_r2    uuid;
  v_ri1   uuid;
  v_ri2   uuid;
  v_out   jsonb := '{}'::jsonb;
  v_res   jsonb;
  v_rows  jsonb;
begin
  select book_id into v_book from public.books order by created_at limit 1;

  insert into public.orders (user_id, total_krw, shipping_fee_krw, status,
                             payment_method, paid_at, point_amount_krw)
  values (v_user, 70000, 0, 'paid', 'toss', now(), 30000)
  returning order_id into v_order;

  insert into public.order_items (order_id, item_type, book_id, unit_price_krw, quantity,
                                  paid_amount_krw, point_alloc_krw, title_snapshot)
  values (v_order, 'book', v_book, 100000, 1, 70000, 30000, '리허설 교재')
  returning order_item_id into v_item;

  -- 포인트 예약(spend) — 반환의 전제다. 없으면 RPC 가 0 을 돌려준다.
  insert into public.point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values (v_user, -30000, '리허설 결제', 0, 'spend', 'order', v_order::text, v_order);

  -- ── ① TS 전량 경로(인자 없음) → 전액 30,000, 축은 order_item ───────────────
  v_res := public.refund_points_for_order_item(v_item, '리허설 전량');
  v_out := v_out || jsonb_build_object('01_전량_인자없음', v_res);
  delete from public.point_transactions
   where kind = 'restore' and order_item_id = v_item;

  -- 환불건 — 같은 항목을 순차로 두 번 환불하는 상황
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 70000, 0,
          20000, 0, 20000, now(), 'REH-P8-1', v_user, 'original')
  returning refund_id into v_r1;

  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw, point_return_krw)
  values (v_r1, v_item, 1, 20000, 20000)
  returning refund_item_id into v_ri1;

  -- ── ② 부분 #1 — 상한 20,000 → 20,000, 축은 refund_item ────────────────────
  v_res := public.refund_points_for_order_item(v_item, '리허설 부분1', 20000, v_ri1);
  v_out := v_out || jsonb_build_object('02_부분1_상한20000', v_res);

  -- ── ⑥ 그 뒤 TS 전량 경로 → 30,000 이 아니라 **잔여 10,000** ───────────────
  v_res := public.refund_points_for_order_item(v_item, '리허설 전량(부분 뒤)');
  v_out := v_out || jsonb_build_object('06_부분뒤_전량', v_res);
  delete from public.point_transactions
   where kind = 'restore' and order_item_id = v_item and ref_type = 'order_item';

  -- ── ③ 부분 #2 — 15,000 요청, 잔여 10,000 으로 캡 ──────────────────────────
  update public.refund_items set is_open = false where refund_item_id = v_ri1;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw, point_return_krw)
  values (v_r1, v_item, 1, 10000, 15000)
  returning refund_item_id into v_ri2;
  v_res := public.refund_points_for_order_item(v_item, '리허설 부분2', 15000, v_ri2);
  v_out := v_out || jsonb_build_object('03_부분2_캡', v_res);

  -- ── ④ ③ 재실행 → 멱등 ────────────────────────────────────────────────────
  v_res := public.refund_points_for_order_item(v_item, '리허설 부분2 재실행', 15000, v_ri2);
  v_out := v_out || jsonb_build_object('04_재실행_멱등', v_res);

  -- 원장 행 모양 — 합계가 배분액을 넘지 않아야 한다
  select jsonb_build_object(
           'rows', jsonb_agg(jsonb_build_object('ref_type', ref_type, 'delta', delta,
                                                'has_item', order_item_id is not null)
                             order by delta desc),
           'sum', sum(delta))
    into v_rows
    from public.point_transactions
   where kind = 'restore' and order_item_id = v_item;
  v_out := v_out || jsonb_build_object('07_원장행', v_rows);

  -- ── ⑤ commit_refund — point_return_krw 미확정 + 포인트 있음 → 거절 ────────
  update public.refund_items set is_open = false where refund_id = v_r1;
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 70000, 0,
          10000, 0, 10000, now(), 'REH-P8-2', v_user, 'original')
  returning refund_id into v_r2;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw)
  values (v_r2, v_item, 1, 10000);   -- point_return_krw 를 일부러 비운다
  v_res := public.commit_refund(v_r2, v_user, '리허설 05');
  v_out := v_out || jsonb_build_object('05_null거절', v_res);

  raise exception 'REHEARSAL_RESULT %', v_out::text;
end
$do$;
rollback;
