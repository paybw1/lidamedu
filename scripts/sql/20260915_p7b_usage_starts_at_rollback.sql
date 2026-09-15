-- 롤백 — 주문항목별 이용 시작일 제거
drop index if exists public.order_items_usage_starts_idx;
alter table public.order_items drop column if exists usage_starts_at;
