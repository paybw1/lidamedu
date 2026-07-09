-- 도서등록 확장 — 구 플랫폼 도서등록화면(docs/도서등록화면.pptx) 사양 반영.
-- ★DRY-RUN 제안 v2 — 승인 후 적용. 기존 도서 무영향(전부 nullable/default).

-- 도서 카테고리 (관리형 목록)
create table if not exists public.book_categories (
  category_id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.book_categories enable row level security;
create policy book_categories_public_read on public.book_categories
  for select using (true);
create policy book_categories_write_staff on public.book_categories
  for all using (private.is_staff((select auth.uid())));

alter table public.books
  add column if not exists category_id uuid
    references public.book_categories (category_id) on delete set null,
  -- 도서이미지: 외부 URL(cover_path, 기존) 우선, 없으면 업로드 파일.
  add column if not exists cover_file_path text,               -- 업로드 표지(공개 버킷)
  -- PDF 도서
  add column if not exists book_type text not null default 'physical', -- physical|pdf
  add column if not exists pdf_path text,                      -- 비공개 버킷 경로
  add column if not exists download_limit int not null default 0, -- 0=무제한
  -- 정보/소개
  add column if not exists short_info text,                    -- 도서정보(1줄)
  add column if not exists short_intro text,                   -- 간략소개
  add column if not exists author_bio text,                    -- 저자소개(리치)
  add column if not exists toc text,                           -- 목차(리치)
  add column if not exists extra1 text,                        -- 기타1
  add column if not exists extra2 text,                        -- 기타2
  -- 가격
  add column if not exists list_price_krw int,                 -- 정가(0/​null=숨김, 판매가만 표기)
  add column if not exists shipping_fee_type text not null default 'cod', -- cod(착불)|prepaid(선불)
  add column if not exists shipping_fee_krw int not null default 0,       -- 선불 금액
  add column if not exists tax_free boolean not null default false,       -- 부가세 면세
  add column if not exists group_discount_ok boolean not null default false, -- 그룹할인 적용
  -- 판매 제한(1인당 구매 개수, null=무제한)
  add column if not exists per_person_limit int,
  -- 과정전용(카탈로그 미노출, 연결된 강의 옵션으로만 구매)
  add column if not exists course_only boolean not null default false,
  -- 프로모션
  add column if not exists event_phrase text,                  -- 이벤트 문구(≤13자 권장)
  add column if not exists label_text text,                    -- 라벨 텍스트
  add column if not exists label_color text,                   -- 라벨 색상(#hex)
  add column if not exists is_recommended boolean not null default false, -- 추천도서
  add column if not exists published_on date,                  -- 출간일
  add column if not exists preview_url text,                   -- 미리보기 링크
  -- 상태 3분리 (기존 sale_status 는 유지; listed 만 신설):
  --   상태(중지)=sale_status 'closed', 판매여부=on_sale↔paused, 노출여부=listed.
  add column if not exists listed boolean not null default true; -- 노출여부(목록 노출)

-- 배송료 — 주문 총액 반영(orders 에 배송료 필드 없음)
alter table public.orders
  add column if not exists shipping_fee_krw int not null default 0;

-- PDF 다운로드 이력(횟수 제한 판정)
create table if not exists public.book_downloads (
  download_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (book_id) on delete cascade,
  order_item_id uuid references public.order_items (order_item_id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists book_downloads_user_book_idx
  on public.book_downloads (user_id, book_id);
alter table public.book_downloads enable row level security;
create policy book_downloads_own_read on public.book_downloads
  for select using (
    user_id = (select auth.uid()) or private.is_staff((select auth.uid()))
  );
-- 쓰기(다운로드 기록)는 서버(adminClient)만.
