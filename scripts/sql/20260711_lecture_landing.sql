-- feat-12 강의 플랫폼 랜딩 — 현장강의 일정 · 리담소식 · 편집형 히어로 배너.
-- 모두 공개 읽기(published), staff 편집. 패턴은 instructors 와 동일.

-- ── 현장강의 일정 ────────────────────────────────────────────────────────────
create table if not exists public.lecture_schedules (
  schedule_id    uuid primary key default gen_random_uuid(),
  subject_label  text not null,                          -- 표시용 "특허법"
  subject_code   text,                                   -- patent/trademark/... (색/연동, 선택)
  title          text not null,                          -- "기본이론 정규반"
  instructor_name text not null,                         -- "임병웅 대표변리사"
  start_date     date,                                   -- 개강일
  day_label      text,                                   -- "월·목"
  time_label     text,                                   -- "19:00–22:00"
  format         text not null default 'offline'
                   check (format in ('offline', 'live', 'video')),
  capacity       int not null default 0 check (capacity >= 0),
  enrolled       int not null default 0 check (enrolled >= 0),
  status         text not null default 'open'
                   check (status in ('open', 'soon', 'waitlist', 'closed')),
  note           text,
  display_order  int not null default 0,
  published      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists lecture_schedules_public_idx
  on public.lecture_schedules (start_date, display_order)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.lecture_schedules;
create trigger set_updated_at before update on public.lecture_schedules
  for each row execute function public.set_updated_at();

alter table public.lecture_schedules enable row level security;
grant select on public.lecture_schedules to anon, authenticated;
grant insert, update on public.lecture_schedules to authenticated;
drop policy if exists lecture_schedules_read on public.lecture_schedules;
create policy lecture_schedules_read on public.lecture_schedules for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));
drop policy if exists lecture_schedules_write on public.lecture_schedules;
create policy lecture_schedules_write on public.lecture_schedules for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- ── 리담소식(공지·이벤트·합격속보) ──────────────────────────────────────────
create table if not exists public.lecture_news (
  news_id       uuid primary key default gen_random_uuid(),
  kind          text not null default 'notice'
                  check (kind in ('notice', 'event', 'passer')),
  title         text not null check (length(title) between 1 and 200),
  body_md       text,
  pinned        boolean not null default false,
  published     boolean not null default true,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists lecture_news_public_idx
  on public.lecture_news (pinned desc, published_at desc)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.lecture_news;
create trigger set_updated_at before update on public.lecture_news
  for each row execute function public.set_updated_at();

alter table public.lecture_news enable row level security;
grant select on public.lecture_news to anon, authenticated;
grant insert, update on public.lecture_news to authenticated;
drop policy if exists lecture_news_read on public.lecture_news;
create policy lecture_news_read on public.lecture_news for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));
drop policy if exists lecture_news_write on public.lecture_news;
create policy lecture_news_write on public.lecture_news for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));

-- ── 편집형 히어로 배너(랜딩 상단 순환 배너) ─────────────────────────────────
create table if not exists public.landing_banners (
  banner_id       uuid primary key default gen_random_uuid(),
  kind            text not null default 'promo'
                    check (kind in ('schedule', 'promo', 'passer', 'custom')),
  accent          text not null default 'gilt'
                    check (accent in ('gilt', 'blue', 'green')),
  eyebrow         text,
  headline        text not null,
  highlight       text,                                  -- headline 내 강조 문구
  sub             text,
  cta_label       text,
  cta_href        text,
  secondary_label text,
  secondary_href  text,
  big_value       text,                                  -- promo 대형 숫자 "15"
  big_unit        text,                                  -- "일" / "%"
  badges          text[] not null default '{}',          -- passer 배지 목록
  display_order   int not null default 0,
  published       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists landing_banners_public_idx
  on public.landing_banners (display_order)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.landing_banners;
create trigger set_updated_at before update on public.landing_banners
  for each row execute function public.set_updated_at();

alter table public.landing_banners enable row level security;
grant select on public.landing_banners to anon, authenticated;
grant insert, update on public.landing_banners to authenticated;
drop policy if exists landing_banners_read on public.landing_banners;
create policy landing_banners_read on public.landing_banners for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));
drop policy if exists landing_banners_write on public.landing_banners;
create policy landing_banners_write on public.landing_banners for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));
