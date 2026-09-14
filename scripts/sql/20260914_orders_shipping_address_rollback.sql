-- 롤백 — feat-11-012 P5-d.
-- ★주의: 되돌리면 이미 받은 주문의 배송지가 사라진다. 이행이 끝난 건은 shipments.address
--   에 복사돼 있지만, **아직 이행 전인 pending_deposit 주문의 주소는 복구 불가**다.
drop index if exists public.orders_shipping_address_idx;
alter table public.orders drop column if exists shipping_address;
