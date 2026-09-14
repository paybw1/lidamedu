-- feat-11-013 P1 — 결제 당시 스냅샷 (260914 요청서 §11-1).
--
-- ★왜 필요한가: 요청서 11-1 이 못 박는다 —
--   「환불 계산은 현재 상품정보가 아니라 반드시 **결제 당시 저장된** 값을 기준으로 한다.」
--   그런데 지금 order_items 가 남기는 스냅샷은 title_snapshot·unit_price_krw 둘뿐이고,
--   수강정책은 plan_policies 를 **실시간으로** 읽는다. 즉 상품 정책을 고치면 기존 수강생의
--   환불 판정이 즉시 바뀐다 — 요청서와 정면으로 충돌한다.
-- ★이 칸들은 **앞으로의 주문에만** 채워진다. 지금 안 만들면 그 사이 주문은 영원히 계산 불가다.
--
-- ★jsonb 한 칸에 몰지 않는 이유: 요청서 §10「최초 결제금액 초과 누적 차단」과
--   §11-15「화면 표시값 = DB 저장값」은 SQL 합계·비교로 지켜야 하는 무결성이다.
--   자유 서술인 환불규정 원문만 jsonb 로 둔다.

alter table public.order_items
  -- ★실제 PG 결제 귀속액. 지금 환불이 틀리는 근본 원인이 이것이 없어서다 —
  --   refundOrderItem 이 unit_price_krw × quantity(= 할인 전)를 토스 cancelAmount 로 보낸다.
  --   쿠폰이 붙으면 단건은 취소가능잔액 초과로 거절되고, 다건은 앞 항목이 과환불된다.
  add column if not exists paid_amount_krw integer,
  -- 정상가 N — 요청서 11-9「할인상품의 공제액은 할인 전 정상가 기준」.
  --   ★세트 도서는 unit_price_krw 가 이미 안분된 할인가라 역산이 불가능하므로 반드시 저장한다.
  add column if not exists list_price_snapshot_krw integer,
  -- 정가 수강기간 D — 기간제 계산식의 분모.
  add column if not exists duration_days_snapshot integer,
  -- 전체 예정 회차 T — 단과 계산식의 분모(요청서 11-8 미종강 강의).
  add column if not exists planned_sessions_snapshot integer,
  -- 항목별 쿠폰 배분액 C. 종전에는 주문 단위만 있고 정산이 읽을 때마다 재계산했다(저장 안 됨).
  add column if not exists coupon_alloc_krw integer not null default 0,
  -- 항목별 포인트 배분액 Q. ★포인트 결제(D15)가 열리기 전까지는 0 이다.
  add column if not exists point_alloc_krw integer not null default 0,
  -- 기간제 / 단과 / 단과묶음 / 별도규정
  add column if not exists refund_calc_type text,
  -- 결제 당시 상품 안내에 고지된 별도 환불규정 원문(요청서 11-2 우선순위 1번).
  add column if not exists refund_policy_snapshot jsonb;

alter table public.order_items
  drop constraint if exists order_items_refund_calc_type_check;
alter table public.order_items
  add constraint order_items_refund_calc_type_check
  check (refund_calc_type is null
         or refund_calc_type in ('period', 'single', 'bundle', 'custom'));

comment on column public.order_items.paid_amount_krw is
  '실제 PG 결제 귀속액(쿠폰·포인트 차감 후). 환불 상한의 권위. NULL = 이 칸이 생기기 전 주문.';
comment on column public.order_items.list_price_snapshot_krw is
  '결제 당시 정상가(할인 전). 환불 공제액 계산 기준 — 세트는 역산 불가라 반드시 저장.';
comment on column public.order_items.refund_calc_type is
  'period=기간제 / single=단과 / bundle=단과묶음 / custom=상품별 별도 환불규정';

-- 전체 예정 회차(T) — 요청서 11-8. 등록 시 단과·패키지는 필수 입력.
--   ★판매 시작 후 변경하면 변경이력을 남기고, 기존 주문은 스냅샷 값을 계속 쓴다.
alter table public.subscription_plans
  add column if not exists planned_sessions integer;

comment on column public.subscription_plans.planned_sessions is
  '사전 고지한 전체 예정 회차. 미종강 강의의 환불 계산 분모(요청서 11-8). 현재 등록 회차 수가 아니다.';

-- 환불 계산에서 「스냅샷 없는 주문」을 골라내는 일이 잦다(수동 입력으로 떨어뜨려야 한다).
create index if not exists order_items_no_snapshot_idx
  on public.order_items (order_id)
  where paid_amount_krw is null;

-- RLS: order_items 의 기존 행 정책을 그대로 따른다(컬럼 단위 정책 없음) — 추가 정책 불필요.
