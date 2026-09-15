-- P7-핸드오프 ③ 리허설 — 부분 금액 환불의 정가 평면 환산.
-- 예외로 전부 롤백된다. 두 항목을 한 주문에 담아 정가=결제액 / 할인 두 경우를 동시에 본다.
do $do$
declare
  v_user   uuid := 'e20ac99a-bfa6-4862-94dd-23c063189463'::uuid;
  v_order  uuid;
  v_a      uuid;  -- 정가 10,000 = 결제 10,000 (할인 없음)
  v_b      uuid;  -- 정가 10,000 → 결제  8,000 (20% 할인)
  v_book   uuid;
  v_refund uuid;
  v_res    jsonb;
  v_out    jsonb;
begin
  select book_id into v_book from public.books order by created_at limit 1;
  if v_book is null then raise exception 'REHEARSAL_RESULT no books'; end if;

  insert into public.orders (user_id, total_krw, shipping_fee_krw, status, payment_method, paid_at)
  values (v_user, 18000, 0, 'paid', 'toss', now())
  returning order_id into v_order;

  insert into public.order_items (order_id, item_type, book_id, unit_price_krw, quantity,
                                  paid_amount_krw, title_snapshot)
  values (v_order, 'book', v_book, 10000, 1, 10000, '리허설 A(할인없음)')
  returning order_item_id into v_a;

  insert into public.order_items (order_id, item_type, book_id, unit_price_krw, quantity,
                                  paid_amount_krw, title_snapshot)
  values (v_order, 'book', v_book, 10000, 1, 8000, '리허설 B(20% 할인)')
  returning order_item_id into v_b;

  -- 접수 → 금액확정 → PG 취소완료까지 한 번에 세운다.
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, pg_cancel_krw, pg_cancelled_at,
                              pg_transaction_no, pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user,
          '리허설', 18000, 0,
          12000, 12000, now(), 'REHEARSAL-TXN', v_user, 'original')
  returning refund_id into v_refund;

  -- 항목별 부분 금액: A 는 8,000 (정가평면 8,000 기대) / B 는 4,000 (정가평면 5,000 기대)
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw, deduction_reason)
  values (v_refund, v_a, 1, 8000, '리허설 공제'),
         (v_refund, v_b, 1, 4000, '리허설 공제');

  v_res := public.commit_refund(v_refund, v_user, '리허설 확정');

  select jsonb_build_object(
    'commit', v_res,
    'refundStatus', (select status from public.refunds where refund_id = v_refund),
    'items', (
      select jsonb_agg(jsonb_build_object(
        'label', oi.title_snapshot,
        'gross', oi.unit_price_krw * oi.quantity,
        'paid',  oi.paid_amount_krw,
        'actualRefund', ri.final_krw,
        'writtenGrossPlane', oi.refund_amount_krw,
        -- 정산이 되돌려 계산하는 값: scaleRefund(written, net=paid, gross)
        'settlementSees', round(oi.refund_amount_krw::numeric * oi.paid_amount_krw
                                / (oi.unit_price_krw * oi.quantity)),
        'matches', round(oi.refund_amount_krw::numeric * oi.paid_amount_krw
                         / (oi.unit_price_krw * oi.quantity)) = ri.final_krw)
        order by oi.title_snapshot)
      from public.refund_items ri join public.order_items oi using (order_item_id)
      where ri.refund_id = v_refund)
  ) into v_out;

  raise exception 'REHEARSAL_RESULT %', v_out::text;
end $do$;
