-- feat-11-013 P7-b — 주문항목별 **이용 시작일** (요청서 11-12)
--
-- ★고치는 버그: 같은 강의를 재구매하면 `grantEnrollmentsForOrderItem` 이 기존 수강권을
--   **연장**하면서 `enrollments.order_item_id` 를 2차 주문항목으로 **덮어쓰고**
--   `enrollments.starts_at` 은 손대지 않는다. 그 결과 —
--     ① 1차 주문항목은 수강권 링크를 잃어 이용일수를 낼 수 없고,
--     ② 2차 주문항목의 이용일수(d)가 **1차 구매일부터** 세어져 공제가 부풀고 환불이 줄어든다.
--
--   요청서 11-12 는 「원래 강의 결제금액과 연장·재수강 결제금액을 서로 섞어서 계산하지
--   않는다」고 못 박았다. 그래서 이용 시작일을 **주문항목**이 갖는다.
--
-- 값의 뜻 — 이 결제분의 이용이 **실제로 시작되는 때**:
--   · 신규 지급        → 지급 시점(now)
--   · 재구매·기간연장  → max(now, 기존 만료일)  ※ computeExpiry 의 기산점과 같다
--   · 패키지(다강의)   → 그중 **가장 이른** 시작(그 순간부터 무언가는 쓸 수 있다)
--
-- 미래 시각이면 아직 시작 전이므로 이용일수 0 이다(요청서 11-5 「수강 시작일 전이면 0일」).
-- 종전에는 개강일 개념이 아예 없어 이 상태를 표현할 수 없었다.
--
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260915_p7b_usage_starts_at.sql

alter table public.order_items
  add column if not exists usage_starts_at timestamptz;

comment on column public.order_items.usage_starts_at is
  '이 주문항목이 산 이용권의 이용 시작일(요청서 11-12). 신규=지급시점, 재구매·연장=기존 만료일, '
  '패키지=그중 가장 이른 시작. ★enrollments.starts_at 을 쓰면 안 된다 — 재구매가 같은 수강권을 '
  '연장하면서 order_item_id 를 덮어써 2차 주문의 이용일수가 1차 구매일부터 세어진다.';

-- 환불 계산이 주문항목 → 이용 시작일을 바로 읽는다. 스냅샷 없는 옛 주문 조회에도 쓴다.
create index if not exists order_items_usage_starts_idx
  on public.order_items (usage_starts_at)
  where usage_starts_at is not null;
