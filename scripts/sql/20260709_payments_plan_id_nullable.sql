-- feat-11 장바구니(C1) — 다건 주문 결제 지원.
-- 장바구니는 여러 상품(강의 plan + 도서 book)을 한 주문(orders/order_items)으로 묶어
-- 주문 단위 1건 결제한다. 이때 payments 는 특정 단일 plan 이 아니라 order 에 귀속되므로
-- plan_id 를 null 허용으로 완화한다.
--   · plan_id NOT NULL(기존): 단건 상품 결제(구독/단일 강의) — 하위호환 유지.
--   · plan_id NULL(신규): 카트 주문 결제 — 지급은 order_items 로만(confirmPayment 가
--     plan_id null 이면 markOrderPaidAndFulfill 후 fulfilledOrder 로 종료, 구독 upsert 스킵).
alter table public.payments alter column plan_id drop not null;
