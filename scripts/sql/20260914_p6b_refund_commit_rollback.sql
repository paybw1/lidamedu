-- feat-11-013 P6-b 롤백.
-- ★쿠폰 무름 표시(revoked_at)를 지우면 이미 복원한 쿠폰이 「사용함」으로 되살아난다.
--   무른 행이 있는지 먼저 확인할 것: select count(*) from coupon_redemptions where revoked_at is not null;

drop function if exists public.commit_refund(uuid, uuid, text);

alter table public.refunds drop column if exists coupon_restored;
alter table public.refund_items
  add column if not exists coupon_restored boolean not null default false;

drop index if exists public.coupon_redemptions_alive_uidx;
alter table public.coupon_redemptions
  add constraint coupon_redemptions_coupon_id_user_id_key unique (coupon_id, user_id);
alter table public.coupon_redemptions
  drop column if exists revoked_at,
  drop column if exists revoke_reason;

-- 상태 이력 트리거를 GUC 이전(auth.uid() 단독)으로 되돌린다.
create or replace function public.refunds_log_status()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if tg_op = 'INSERT' then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, null, new.status, auth.uid(), '접수');
  elsif new.status is distinct from old.status then
    insert into public.refund_status_logs (refund_id, from_status, to_status, actor_id, memo)
    values (new.refund_id, old.status, new.status, auth.uid(), null);
  end if;
  return null;
end;
$fn$;

drop function if exists public.set_refund_status(uuid, text, uuid, text);
drop function if exists public.set_refund_status(uuid, text, uuid, text, boolean);
