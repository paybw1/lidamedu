-- feat-8-028 — 할인 삭제 허용. 결제 이력(payments.discount_id)이 참조 중이어도
-- 삭제 가능하도록 FK 를 ON DELETE SET NULL 로. 결제 금액은 payments 에 보존, 링크만 해제.
alter table public.payments
  drop constraint if exists payments_discount_id_fkey;
alter table public.payments
  add constraint payments_discount_id_fkey
    foreign key (discount_id) references public.discounts(discount_id)
    on delete set null;
