-- feat-11-006 Phase 4 (A6a) — 수강평/교재평(리뷰) + 무료배송 임계
-- 설계: docs/features/강의플랫폼-추가설계-방향.md §3 Phase 4
-- 리뷰 대상: plan(강의 상품) / book(교재). 구매자 전용 작성은 action 게이트로 강제하고
--   RLS 는 author 기준(코드베이스 관례 — 소유권 방어의 단일 지점).
begin;

create table if not exists public.course_reviews (
  review_id     uuid primary key default gen_random_uuid(),
  target_type   text not null check (target_type in ('plan','book')),
  target_id     uuid not null,                     -- plan_id 또는 book_id
  author_id     uuid not null references public.profiles(profile_id) on delete cascade,
  rating        int not null check (rating between 1 and 5),
  body          text not null default '',
  is_public     boolean not null default true,     -- 작성자 공개 여부
  is_best       boolean not null default false,    -- 운영자 베스트 선정
  is_blinded    boolean not null default false,    -- 운영자 블라인드(신고 처리)
  blind_reason  text,
  report_count  int not null default 0,            -- 신고 누적(참고용)
  admin_reply   text,                              -- 운영자 답변
  admin_reply_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
-- 한 대상당 1인 1리뷰. 부분 유니크(soft-delete 제외) → 삭제 후 재작성 허용.
create unique index if not exists course_reviews_unique_author
  on public.course_reviews(target_type, target_id, author_id) where deleted_at is null;
create index if not exists course_reviews_target_idx
  on public.course_reviews(target_type, target_id) where deleted_at is null;

-- 신고 로그(중복 신고 방지 · 감사).
create table if not exists public.course_review_reports (
  report_id  uuid primary key default gen_random_uuid(),
  review_id  uuid not null references public.course_reviews(review_id) on delete cascade,
  reporter_id uuid not null references public.profiles(profile_id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);

drop trigger if exists course_reviews_updated_at on public.course_reviews;
create trigger course_reviews_updated_at before update on public.course_reviews
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.course_reviews enable row level security;
alter table public.course_review_reports enable row level security;

-- SELECT: 공개(공개·미블라인드·미삭제) OR 본인 OR staff.
--   ★본인 정책은 deleted_at 필터 없음 → 본인 soft-delete UPDATE 시 재조회 42501 회피
--     (soft-delete-rls 함정 대응).
drop policy if exists course_reviews_select_public on public.course_reviews;
create policy course_reviews_select_public on public.course_reviews for select
  using (is_public and not is_blinded and deleted_at is null);
drop policy if exists course_reviews_select_own on public.course_reviews;
create policy course_reviews_select_own on public.course_reviews for select
  using (author_id = (select auth.uid()));
drop policy if exists course_reviews_select_staff on public.course_reviews;
create policy course_reviews_select_staff on public.course_reviews for select
  using (private.is_staff((select auth.uid())));

-- INSERT: 본인 명의만(구매 검증은 action). UPDATE/DELETE: 본인 또는 staff.
drop policy if exists course_reviews_insert_own on public.course_reviews;
create policy course_reviews_insert_own on public.course_reviews for insert
  with check (author_id = (select auth.uid()));
drop policy if exists course_reviews_update_own_or_staff on public.course_reviews;
create policy course_reviews_update_own_or_staff on public.course_reviews for update
  using (author_id = (select auth.uid()) or private.is_staff((select auth.uid())))
  with check (author_id = (select auth.uid()) or private.is_staff((select auth.uid())));

-- 신고: 본인 명의로 삽입, 본인·staff 조회.
drop policy if exists course_review_reports_insert_own on public.course_review_reports;
create policy course_review_reports_insert_own on public.course_review_reports for insert
  with check (reporter_id = (select auth.uid()));
drop policy if exists course_review_reports_select on public.course_review_reports;
create policy course_review_reports_select on public.course_review_reports for select
  using (reporter_id = (select auth.uid()) or private.is_staff((select auth.uid())));

commit;

select
  (select count(*) from public.course_reviews) as reviews,
  (select count(*) from public.course_review_reports) as reports;
