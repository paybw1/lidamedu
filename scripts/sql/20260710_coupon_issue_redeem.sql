-- feat-13 쿠폰 발급 + 체크아웃 적용 — 개별 발급(grants)·사용 이력(redemptions) + orders 연결.
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260710_coupon_issue_redeem.sql → npm run db:typegen
-- 정의부 SSOT=coupons(20260711_coupons.sql). 이 마이그레이션은 발급·사용·주문연결만 추가.

-- ── 개별 발급(비공용 쿠폰) — is_shared=false 쿠폰을 특정 회원에게 지급. ──────────────
create table if not exists public.coupon_grants (
  grant_id     uuid primary key default gen_random_uuid(),
  coupon_id    uuid not null references public.coupons (coupon_id) on delete cascade,
  user_id      uuid not null references public.profiles (profile_id) on delete cascade,
  granted_by   uuid references public.profiles (profile_id) on delete set null,
  granted_at   timestamptz not null default now(),
  expires_at   timestamptz,                       -- null = 쿠폰 valid_to 를 따름
  revoked_at   timestamptz,
  unique (coupon_id, user_id)                      -- 같은 쿠폰 중복 발급 방지
);
create index if not exists coupon_grants_user_idx
  on public.coupon_grants (user_id) where revoked_at is null;

alter table public.coupon_grants enable row level security;
grant select on public.coupon_grants to authenticated;
drop policy if exists coupon_grants_read on public.coupon_grants;
create policy coupon_grants_read on public.coupon_grants for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
-- 쓰기(발급/회수)는 서버 adminClient(service_role) 전용 — 별도 정책 없음.

-- ── 사용 이력 — 1인 1회, 발행수 총량 상한, 정산·쿠폰함 상태 산출. ──────────────────
create table if not exists public.coupon_redemptions (
  redemption_id uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons (coupon_id) on delete cascade,
  user_id       uuid not null references public.profiles (profile_id) on delete cascade,
  order_id      uuid references public.orders (order_id) on delete set null,
  discount_krw  int not null default 0 check (discount_krw >= 0),
  redeemed_at   timestamptz not null default now(),
  unique (coupon_id, user_id)                      -- 1인 1회 사용
);
create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id);

alter table public.coupon_redemptions enable row level security;
grant select on public.coupon_redemptions to authenticated;
drop policy if exists coupon_redemptions_read on public.coupon_redemptions;
create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));

-- ── 주문에 쿠폰 적용 흔적 — 결제 완료 시 redemption 기록의 근거. ──────────────────
alter table public.orders
  add column if not exists coupon_id uuid references public.coupons (coupon_id) on delete set null,
  add column if not exists coupon_discount_krw int not null default 0 check (coupon_discount_krw >= 0);
