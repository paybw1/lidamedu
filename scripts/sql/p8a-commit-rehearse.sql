-- P8-a 리허설 ⑧ — commit_refund **성공 경로**. 실제로 돈이 움직이는 유일한 길이다.
-- 예외로 전부 롤백된다.
begin;
do $do$
declare
  v_user  uuid := 'e20ac99a-bfa6-4862-94dd-23c063189463'::uuid;
  v_book  uuid;
  v_order uuid;
  v_item  uuid;
  v_r1    uuid;
  v_ri1   uuid;
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

  insert into public.point_transactions
    (user_id, delta, reason, balance_after, kind, ref_type, ref_id, order_id)
  values (v_user, -30000, '리허설 결제', 0, 'spend', 'order', v_order::text, v_order);

  -- 환불: 현금 20,000(PG 평면) + 포인트 20,000 → 학생이 받는 총액 40,000
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 70000, 0,
          20000, 0, 20000, now(), 'REH-P8-C', v_user, 'original')
  returning refund_id into v_r1;

  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw, point_return_krw)
  values (v_r1, v_item, 1, 20000, 20000)
  returning refund_item_id into v_ri1;

  v_res := public.commit_refund(v_r1, v_user, '리허설 확정');
  v_out := v_out || jsonb_build_object('08_확정_성공경로', v_res);

  select jsonb_build_object(
           'rows', jsonb_agg(jsonb_build_object('ref_type', ref_type, 'delta', delta,
                                                'ref_is_refund_item', ref_id = v_ri1::text)),
           'sum', sum(delta))
    into v_rows
    from public.point_transactions
   where kind = 'restore' and order_item_id = v_item;
  v_out := v_out || jsonb_build_object('09_원장행', v_rows);

  -- 정가 평면 환산도 함께 확인(P7-h3 가 넣은 식) — 20,000 × 100,000 ÷ 70,000 ≈ 28,571
  select jsonb_build_object('refund_amount_krw', refund_amount_krw,
                            'refunded', refunded_at is not null)
    into v_rows
    from public.order_items where order_item_id = v_item;
  v_out := v_out || jsonb_build_object('10_정가평면', v_rows);

  raise exception 'REHEARSAL_RESULT %', v_out::text;
end
$do$;
rollback;
