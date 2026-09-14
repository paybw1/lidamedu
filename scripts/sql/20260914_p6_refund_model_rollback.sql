-- feat-11-013 P6-a 롤백. 추가만 한 마이그레이션이라 되돌리기는 전부 drop 이다.
-- ★refunds 에 실제 접수 건이 들어간 뒤에는 쓰지 말 것 — 환불 이력이 통째로 사라진다.

drop trigger if exists refunds_log_status_trg      on public.refunds;
drop trigger if exists refund_items_sync_open_trg  on public.refunds;
drop trigger if exists refunds_sync_closed_trg     on public.refunds;
drop trigger if exists refund_items_touch_trg      on public.refund_items;

drop function if exists public.refunds_log_status();
drop function if exists public.refund_items_sync_open();
drop function if exists public.refunds_sync_closed();
drop function if exists public.refund_items_touch();

drop table if exists public.refund_status_logs;
drop table if exists public.refund_items;
drop table if exists public.refunds;
