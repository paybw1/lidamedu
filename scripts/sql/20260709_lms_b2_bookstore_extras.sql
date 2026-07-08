-- feat-11 B2 — 도서몰 부가 기능 4종 (찜·미리보기·세트/번들·재입고 알림).
-- ★DRY-RUN 제안 — 승인 후 적용. private.is_staff(uuid) 기존 RLS 헬퍼 재사용.

-- ── B2-1 찜/위시리스트 ───────────────────────────────────────────────────────
create table if not exists public.book_wishlists (
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);
alter table public.book_wishlists enable row level security;
create policy book_wishlists_own on public.book_wishlists
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── B2-2 미리보기(look-inside) 샘플 페이지 ──────────────────────────────────
create table if not exists public.book_preview_pages (
  preview_id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (book_id) on delete cascade,
  sort_order int not null default 0,
  image_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists book_preview_pages_book_idx
  on public.book_preview_pages (book_id, sort_order);
alter table public.book_preview_pages enable row level security;
-- 판매중(및 노출) 도서의 미리보기는 공개 읽기, 쓰기는 staff.
create policy book_preview_public_read on public.book_preview_pages
  for select using (
    exists (
      select 1 from public.books b
      where b.book_id = book_preview_pages.book_id
        and b.deleted_at is null
        and b.sale_status in ('on_sale', 'paused', 'closed')
    )
    or private.is_staff((select auth.uid()))
  );
create policy book_preview_write_staff on public.book_preview_pages
  for all using (private.is_staff((select auth.uid())));

-- ── B2-3 세트·번들 ─────────────────────────────────────────────────────────
-- 번들 = 여러 도서를 묶어 할인가로 판매. 결제 시 회원 도서로 확장해 배송(구현 단계에서
-- 번들가를 회원 도서 정가 비율로 배분 → 부분환불/재고 정합 유지). 스키마는 정의만.
create table if not exists public.book_bundles (
  bundle_id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_krw int not null,
  cover_path text,
  sale_status text not null default 'draft',      -- draft|on_sale|paused|closed
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.book_bundle_items (
  bundle_id uuid not null references public.book_bundles (bundle_id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  primary key (bundle_id, book_id)
);
alter table public.book_bundles enable row level security;
alter table public.book_bundle_items enable row level security;
create policy book_bundles_public_read on public.book_bundles
  for select using (
    (sale_status in ('on_sale', 'paused', 'closed') and deleted_at is null)
    or private.is_staff((select auth.uid()))
  );
create policy book_bundles_write_staff on public.book_bundles
  for all using (private.is_staff((select auth.uid())));
create policy book_bundle_items_read on public.book_bundle_items
  for select using (true);
create policy book_bundle_items_write_staff on public.book_bundle_items
  for all using (private.is_staff((select auth.uid())));

-- ── B2-4 재입고 알림 ───────────────────────────────────────────────────────
-- 품절 도서에 사용자가 알림 신청 → 재입고(재고>0) 시 알림 발송(cron/트리거는 구현 단계).
create table if not exists public.book_restock_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (user_id, book_id)
);
alter table public.book_restock_alerts enable row level security;
create policy book_restock_own on public.book_restock_alerts
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
