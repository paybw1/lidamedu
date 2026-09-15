-- P7-핸드오프 ① 리허설 — 배송비 환불 자리. 예외로 전부 롤백된다.
-- 주문: 교재 10,000 + 배송비 3,000 = 13,000
do $do$
declare
  v_user   uuid := 'e20ac99a-bfa6-4862-94dd-23c063189463'::uuid;
  v_book   uuid;
  v_order  uuid;
  v_item   uuid;
  v_r1     uuid;
  v_out    jsonb := '{}'::jsonb;
  v_res    jsonb;
begin
  select book_id into v_book from public.books order by created_at limit 1;

  insert into public.orders (user_id, total_krw, shipping_fee_krw, status, payment_method, paid_at)
  values (v_user, 13000, 3000, 'paid', 'toss', now())
  returning order_id into v_order;

  insert into public.order_items (order_id, item_type, book_id, unit_price_krw, quantity,
                                  paid_amount_krw, title_snapshot)
  values (v_order, 'book', v_book, 10000, 1, 10000, '리허설 교재')
  returning order_item_id into v_item;

  -- ── 01. 배송비 0원 → 종전 동작(배송비만큼 잔여가 남아 partial_done) ────────────
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 13000, 0,
          10000, 0, 10000, now(), 'REH-01', v_user, 'original')
  returning refund_id into v_r1;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw)
  values (v_r1, v_item, 1, 10000);
  v_res := public.commit_refund(v_r1, v_user, '리허설 01');
  v_out := v_out || jsonb_build_object('01_배송비0원',
    jsonb_build_object('ok', v_res->>'ok', 'status', v_res->>'status',
      'note', '배송비 3,000원이 잔여로 남아 partial_done 이 맞다'));

  -- 되돌리고 다시 (같은 항목을 재사용하기 위해)
  delete from public.refund_items where refund_id = v_r1;
  delete from public.refunds where refund_id = v_r1;
  update public.order_items
     set refunded_at = null, refund_amount_krw = null, refund_reason = null
   where order_item_id = v_item;

  -- ── 02. 배송비 상한 초과 → 거부 ───────────────────────────────────────────────
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 13000, 0,
          10000, 5000, 10000, now(), 'REH-02', v_user, 'original')
  returning refund_id into v_r1;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw)
  values (v_r1, v_item, 1, 5000);
  v_res := public.commit_refund(v_r1, v_user, '리허설 02');
  v_out := v_out || jsonb_build_object('02_배송비상한초과', v_res);

  delete from public.refund_items where refund_id = v_r1;
  delete from public.refunds where refund_id = v_r1;

  -- ── 03. 합계 불일치(배송비를 this_refund_krw 에 안 더함) → 거부 ───────────────
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 13000, 0,
          10000, 3000, 10000, now(), 'REH-03', v_user, 'original')
  returning refund_id into v_r1;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw)
  values (v_r1, v_item, 1, 10000);
  v_res := public.commit_refund(v_r1, v_user, '리허설 03');
  v_out := v_out || jsonb_build_object('03_합계불일치', v_res);

  delete from public.refund_items where refund_id = v_r1;
  delete from public.refunds where refund_id = v_r1;

  -- ── 04. ★배송비 포함 전액 환불 → full_done ───────────────────────────────────
  insert into public.refunds (order_id, user_id, status, intake_channel, intake_by,
                              request_reason, original_paid_krw, prior_refunded_krw,
                              this_refund_krw, shipping_refund_krw,
                              pg_cancel_krw, pg_cancelled_at, pg_transaction_no,
                              pg_operator, refund_method)
  values (v_order, v_user, 'pg_done', 'phone', v_user, '리허설', 13000, 0,
          13000, 3000, 13000, now(), 'REH-04', v_user, 'original')
  returning refund_id into v_r1;
  insert into public.refund_items (refund_id, order_item_id, quantity, final_krw)
  values (v_r1, v_item, 1, 10000);
  v_res := public.commit_refund(v_r1, v_user, '리허설 04');
  v_out := v_out || jsonb_build_object('04_배송비포함전액',
    jsonb_build_object('commit', v_res,
      'refundStatus', (select status from public.refunds where refund_id = v_r1),
      'orderStatus', (select status from public.orders where order_id = v_order),
      'itemGrossPlane', (select refund_amount_krw from public.order_items
                         where order_item_id = v_item)));

  raise exception 'REHEARSAL_RESULT %', v_out::text;
end $do$;
