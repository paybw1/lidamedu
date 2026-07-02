-- feat-8-028 — 환불(3일 정책) + 구독 취소 표지.
-- payments: 환불 기록(status enum 에 'refunded' 이미 존재). user_subscriptions: 취소 시각.
-- 매월 자동결제(auto_renew·billing)는 Stage 5 별도 마이그레이션.

alter table public.payments
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_amount_krw integer,
  add column if not exists refund_reason text;

alter table public.user_subscriptions
  add column if not exists cancelled_at timestamptz,
  -- 정기결제 자동 갱신 여부(동의 기반, 기본 off). Stage 5 빌링 크론이 true + cancelled_at IS NULL 만 청구.
  -- 3일 이후 해지 = auto_renew=false + cancelled_at 세팅(잔여기간 이용, 다음 갱신 청구 없음).
  add column if not exists auto_renew boolean not null default false;
