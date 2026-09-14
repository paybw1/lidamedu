-- feat-11-013 P6-b — 환불 확정 커밋 (요청서 PART B §9·§10, 설계 D8).
--
-- ★요청서 §10 「후속처리 중 하나라도 실패하면 일부 데이터만 변경된 상태가 남지 않도록」.
--   supabase-js 에는 다중 문 트랜잭션이 없다. 그래서 **돈과 원장**은 RPC 한 번으로 묶는다.
--
-- ★무엇을 RPC 가 갖고 무엇을 갖지 않는가 — 경계를 먼저 적는다.
--     RPC 가 갖는 것   = 항목 환불 기록 · 결제 포인트 반환 · 적립 포인트 회수 · 쿠폰 복원 ·
--                        주문 상태 · 환불건 상태.  틀리면 **돈이 틀리는** 것들이다.
--     RPC 가 안 갖는 것 = 수강권 회수 · 연장 일수 원복 · 재고 복원 · 배송 반품 표시.
--                        이미 TS(`revokeItemFulfillment`)에 있고 **이미 멱등**하다.
--   호출 순서는 **회수 먼저, 커밋 나중**이다. 그래야 최악이 「수강권은 회수됐는데 환불 기록이
--   없다」 — 재시도로 닫히고 돈은 틀리지 않는다. 반대로 두면 「환불 완료인데 수강권이 살아
--   있다」가 되고, 이건 조용히 학원 손해로 남는다.

-- ── 1. 쿠폰 복원 모델 — 지우지 않고 무른다 ─────────────────────────────────
-- ★현행은 쿠폰 사용 판정이 `coupon_redemptions` **행의 존재**다. 그래서 복원하려면 행을
--   지워야 하는데, 그러면 회원 CRM 의 사용 이력도 같이 사라진다. 무른 표시를 두고
--   유니크를 **살아 있는 행에만** 건다.
alter table public.coupon_redemptions
  add column if not exists revoked_at    timestamptz,
  add column if not exists revoke_reason text;

alter table public.coupon_redemptions
  drop constraint if exists coupon_redemptions_coupon_id_user_id_key;
create unique index if not exists coupon_redemptions_alive_uidx
  on public.coupon_redemptions (coupon_id, user_id) where revoked_at is null;

comment on column public.coupon_redemptions.revoked_at is
  '환불로 사용을 무른 시각. 1인 1회·총량 판정은 이 값이 null 인 행만 센다(feat-11-013 P6-b).';

-- ── 2. 쿠폰 복원 여부는 **주문 단위** 결정이다 ──────────────────────────────
-- 쿠폰은 orders.coupon_id 로 주문에 붙는다. 항목마다 복원 여부를 따로 둘 수 없다.
alter table public.refunds
  add column if not exists coupon_restored boolean not null default false;
alter table public.refund_items
  drop column if exists coupon_restored;

comment on column public.refunds.coupon_restored is
  '이 환불로 주문 쿠폰 사용을 무를지(요청서 §9 「쿠폰 복원 여부는 정책에 따라」). 전액 환불일 때만 실제로 무른다.';

-- ── 3. 상태 이력의 「누가·메모」를 채운다 ───────────────────────────────────
-- ★종전 트리거는 auth.uid() 만 봤다. 그런데 이 테이블의 쓰기는 전부 서버(service_role)라
--   auth.uid() 가 **항상 null** 이다 — 요청서 §10 의 「누가」가 100% 비게 된다.
--   RPC·서버 액션이 GUC 로 행위자와 메모를 넣고, 트리거가 그것을 읽는다.
create or replace function public.refunds_log_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_actor uuid := coalesce(
    nullif(current_setting('app.refund_actor', true), '')::uuid,
    auth.uid()
  );
  v_memo text := nullif(current_setting('app.refund_memo', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, null, new.status, v_actor, coalesce(v_memo, '접수'));
  elsif new.status is distinct from old.status then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, old.status, new.status, v_actor, v_memo);
  end if;
  return null;
end;
$fn$;

-- ── 4. 확정 커밋 ────────────────────────────────────────────────────────────
create or replace function public.commit_refund(
  p_refund_id uuid,
  p_actor_id  uuid,
  p_memo      text default null
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_r          public.refunds%rowtype;
  v_order_id   uuid;
  v_items_sum  integer := 0;
  v_missing    integer := 0;
  v_partialqty integer := 0;
  v_count      integer := 0;
  v_foreign    integer := 0;
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
         coalesce(sum(ri.final_krw), 0)
    into v_count, v_missing, v_partialqty, v_foreign, v_items_sum
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
  if v_items_sum <> v_r.this_refund_krw then
    return jsonb_build_object('ok', false, 'error',
      format('상품별 환불금액 합계 %s원이 확정 환불금액 %s원과 다릅니다.',
             to_char(v_items_sum, 'FM999,999,999'),
             to_char(v_r.this_refund_krw, 'FM999,999,999')));
  end if;

  -- 요청서 §10 — 최초 결제금액을 초과하는 누적 환불 차단(DB 제약이 이미 막지만,
  -- 여기서 **말이 되는 문장**으로 먼저 돌려준다).
  v_remaining := coalesce(v_r.original_paid_krw, 0) - coalesce(v_r.prior_refunded_krw, 0);
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
    select ri.order_item_id, oi.unit_price_krw, oi.quantity, oi.refunded_at
      from public.refund_items ri
      join public.order_items oi using (order_item_id)
     where ri.refund_id = p_refund_id
  loop
    if rec.refunded_at is null then
      -- ★정가 평면으로 기록한다(P6-0). 정산 3파일이 이 평면을 읽는다.
      --   ※P7 이 「수강분 공제」로 부분 금액 환불을 열면 이 등식이 깨진다 —
      --     그때는 실환불액을 정가 평면으로 **환산**해 넣어야 한다.
      update public.order_items
         set refunded_at = now(),
             refund_amount_krw = rec.unit_price_krw * rec.quantity,
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
     and coalesce(v_r.prior_refunded_krw, 0) + v_r.this_refund_krw = v_r.original_paid_krw then
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
     and coalesce(v_r.prior_refunded_krw, 0) + v_r.this_refund_krw = v_r.original_paid_krw
    then 'full_done' else 'partial_done' end;
  update public.refunds set status = v_target where refund_id = p_refund_id;

  res := jsonb_build_object(
    'ok', true, 'status', v_target, 'orderId', v_order_id,
    'pointReturned', v_point_back, 'pointRevoked', v_revoked,
    'pointRevokeShortfall', v_shortfall, 'couponRestored', v_coupon);
  return res;
end;
$fn$;

-- ★service_role 전용 — 이 함수는 수강권·포인트·쿠폰·주문상태를 한 번에 움직인다.
--   authenticated 에 열어 두면 강사 계정이 PostgREST 로 직접 환불을 확정할 수 있다.
--   (private.is_staff 에는 instructor 가 포함된다.)
revoke all on function public.commit_refund(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.commit_refund(uuid, uuid, text) to service_role;

comment on function public.commit_refund(uuid, uuid, text) is
  'feat-11-013 P6-b 환불 확정 커밋. 돈과 원장만 묶는다 — 수강권·재고 회수는 호출 전에 TS 가 한다.';

-- ── 5. 상태 전이 — 이력의 「누가·메모」를 같은 트랜잭션에서 세운다 ──────────
-- ★PostgREST 는 요청마다 트랜잭션이 다르다. set_config 를 따로 호출하면 다음 요청에
--   남아 있지 않으므로, **전이와 GUC 설정이 같은 함수 안에** 있어야 이력에 사람이 남는다.
-- ★전이의 **적법성 판정은 하지 않는다** — 그 표는 app/features/refunds/lib/refund-status.ts
--   한 곳에만 둔다. 두 곳에 같은 표를 두면 반드시 어긋난다. 여기는 상태 문자열(check 제약)과
--   금액 상한(check 제약)만 백스톱으로 막는다.
create or replace function public.set_refund_status(
  p_refund_id uuid,
  p_status    text,
  -- ★행위자는 없을 수 있다 — 토스 웹훅이 취소정보를 옮겨 적고 상태를 넘길 때는 사람이 없다.
  p_actor_id  uuid default null,
  p_memo      text default null,
  -- ★종결된 건을 되돌리는 것은 **명시적 의사**여야 한다. 아래 가드 참조.
  p_allow_reopen boolean default false
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_from text;
begin
  select status into v_from from public.refunds where refund_id = p_refund_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', '환불건을 찾을 수 없습니다.');
  end if;
  if v_from = p_status then
    return jsonb_build_object('ok', true, 'idempotent', true, 'status', v_from);
  end if;

  -- ★★종결된 건은 **기본적으로 움직이지 않는다.**
  --   토스 웹훅은 재전송된다. 이미 환불완료된 건에 재전송이 들어오면 종전 구현은 상태를
  --   PG 취소완료로 되돌리고 closed_at 을 풀어, 같은 주문항목이 **다시 환불 가능**해졌다
  --   (예행 05 에서 실제로 잡혔다). 되돌리기는 원장이 사유를 달고 하는 일이지
  --   네트워크 재시도가 할 일이 아니다.
  if v_from in ('partial_done','full_done','rejected','withdrawn') and not p_allow_reopen then
    return jsonb_build_object('ok', false, 'reopenBlocked', true, 'status', v_from,
      'error', '이미 종결된 환불건입니다. 되돌리려면 원장 권한과 수정사유가 필요합니다.');
  end if;

  perform set_config('app.refund_actor', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.refund_memo', coalesce(p_memo, ''), true);
  update public.refunds set status = p_status where refund_id = p_refund_id;

  return jsonb_build_object('ok', true, 'from', v_from, 'status', p_status);
end;
$fn$;

-- 옛 4인자 판을 남겨 두면 PostgREST 가 어느 쪽을 부를지 애매해진다.
drop function if exists public.set_refund_status(uuid, text, uuid, text);

revoke all on function public.set_refund_status(uuid, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_refund_status(uuid, text, uuid, text, boolean) to service_role;

comment on function public.set_refund_status(uuid, text, uuid, text, boolean) is
  'feat-11-013 P6-b 환불 상태 전이 + 이력 행위자·메모 기록. 적법성 판정은 TS 상태기계가 한다.';
