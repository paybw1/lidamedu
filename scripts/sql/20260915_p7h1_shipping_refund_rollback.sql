-- feat-11-013 P7-핸드오프 ① — 배송비 환불 자리 (롤백)
--
-- 배송비는 orders.shipping_fee_krw(주문 헤더)에 있는데 refund_items 는 order_items 만
-- 가리킨다. 그래서 도서 주문을 전부 환불해도 배송비만큼 「남은 환불 가능금액」이 남아
-- partial_done 으로만 종결됐다(full_done 도달 불가).
--
-- ②안(original_paid_krw 에서 배송비 제외)은 택하지 않았다 — 출고 **전** 취소는 배송비도
-- 돌려줘야 하는데 ②는 배송비를 영구히 환불 불가로 만든다.
--
-- ★반품비는 새 칸을 만들지 않는다. refund_items.shipping_deduction_krw 가 이미 그 자리이며
--   P7 계산 엔진이 채운다. 헤더 칸은 *돌려주는* 배송비, 항목 칸은 *떼는* 반품비다.
--
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260915_p7h1_shipping_refund.sql

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
  if v_items_sum <> v_r.this_refund_krw then
    return jsonb_build_object('ok', false, 'error',
      format('상품별 환불금액 합계 %s원이 확정 환불금액 %s원과 다릅니다.',
             to_char(v_items_sum, 'FM999,999,999'),
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

  -- 이력에 남길 행위자·메모.
  -- ★NULL 을 그대로 넘기면 set_config 가 거부한다. 웹훅·스윕처럼 **사람이 없는 호출**이
  --   실제로 있으므로 빈 문자열로 떨어뜨리고, 트리거가 nullif 로 되돌린다.
  perform set_config('app.refund_actor', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.refund_memo', coalesce(p_memo, '환불 확정'), true);
  v_reason := coalesce(nullif(btrim(v_r.request_reason), ''), '환불');

  -- ── 항목 환불 기록 + 결제 포인트 반환 ────────────────────────────────────
  for rec in
    select ri.order_item_id, ri.final_krw, oi.unit_price_krw, oi.quantity,
           oi.paid_amount_krw, oi.refunded_at
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
               when coalesce(rec.paid_amount_krw, rec.unit_price_krw * rec.quantity) > 0
               then round(
                      coalesce(rec.final_krw, 0)::numeric
                      * (rec.unit_price_krw * rec.quantity)
                      / coalesce(rec.paid_amount_krw, rec.unit_price_krw * rec.quantity))
               else 0
             end,
             refund_reason = v_reason
       where order_item_id = rec.order_item_id;
    end if;
    -- 결제에 쓴 포인트 반환 — 금액 권위는 order_items.point_alloc_krw 이고 RPC 가 읽는다.
    -- 멱등은 point_transactions 의 (kind, ref_type, ref_id) 유니크가 지킨다.
    v_point_back := v_point_back + coalesce(
      (public.refund_points_for_order_item(rec.order_item_id, '환불 — ' || v_reason)->>'refunded')::integer, 0);
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

alter table public.refunds drop constraint if exists refunds_shipping_refund_nonneg_check;
alter table public.refunds drop column if exists shipping_refund_krw;

