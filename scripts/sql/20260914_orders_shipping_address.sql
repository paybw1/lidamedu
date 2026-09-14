-- feat-11-012 P5-d — 주문 시점 배송지 (원장 결정 D1 = 종이책 포함, 2026-09-14).
--
-- ★왜 orders 인가: 주소는 **결제 시점**에 확정돼야 하는데, shipments 는 결제가 끝난 뒤
--   이행 단계에서 생긴다(orders.server.ts fulfillBookShipment). shipments.address 칸은
--   이미 있지만 그때는 이미 늦다. 그래서 주문에 싣고, 이행 때 shipments.address 로 옮긴다.
-- ★jsonb 인 이유: 주소는 주문 시점의 **스냅샷**이다. profiles.address 가 나중에 바뀌어도
--   이미 보낸 주문의 배송지는 그대로여야 한다(title_snapshot 과 같은 취지).
--   모양: {name, phone, postcode, address1, address2, memo}
-- ★NULL 허용: 강의만 산 주문·PDF 도서 주문에는 배송지가 없다. NOT NULL 로 묶으면
--   기존 주문 전부와 앞으로의 강의 주문이 걸린다.

alter table public.orders
  add column if not exists shipping_address jsonb;

comment on column public.orders.shipping_address is
  '주문 시점 배송지 스냅샷 {name, phone, postcode, address1, address2, memo}. 종이책 포함 주문만. 이행 시 shipments.address 로 복사된다.';

-- 배송지가 있는 주문만 골라 보는 일이 운영 화면에서 잦다(미입력 주문 추적).
create index if not exists orders_shipping_address_idx
  on public.orders (created_at desc)
  where shipping_address is not null;

-- RLS: orders 의 기존 정책을 그대로 따른다(본인 주문 self-read / staff 전체).
--   컬럼 단위 정책이 없으므로 추가 정책 불필요 — 새 칸은 기존 행 정책에 자동으로 포함된다.
