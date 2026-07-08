-- feat-11-001 — M2 시청 골격 테이블 배치 (설계: docs/features/lidamedu-이전-M1-설계.md §3.1~3.5)
-- 원장 승인 2026-07-08 (단서: staff_memo 별도 테이블 분리, is_active=false→hidden 백필 명시)
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260708_lms_m2_tables.sql → npm run db:typegen
-- 범위: 영상·회차·에디션 / plans 확장 / 수강권(enrollments). watch_*(M3)·orders(M4)는 이 파일에 없음.
-- 네이밍: 기존 lecture_* = 강의노트(PDF) 도메인 — 신규는 course_/lesson_ 접두어로 격리.

-- ─────────────────────────────────────────────────────────────
-- 1) 영상·회차·에디션 (§3.1)
-- ─────────────────────────────────────────────────────────────

create table public.course_series (
  series_id uuid primary key default gen_random_uuid(),
  title text not null,
  subject_code text not null,               -- 기존 과목 코드 규약(patent/trademark/…)
  instructor_id uuid references public.profiles (profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  course_id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.course_series (series_id) on delete restrict,
  edition_label text not null,              -- "2026판"
  edition_year int not null,
  is_current boolean not null default false,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  description text,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- 신판 기본 노출: 시리즈당 current 1개만
create unique index courses_current_per_series on public.courses (series_id) where is_current and deleted_at is null;

create table public.course_lessons (
  lesson_id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (course_id) on delete restrict,
  lesson_no int not null,                   -- 회차 번호(1강, 2강…)
  title text not null,
  sort_order int not null default 0,        -- 노출 순서(회차 번호와 분리 — 보강·부록 삽입)
  instructor_id uuid references public.profiles (profile_id) on delete set null, -- null=시리즈 대표 강사
  is_preview boolean not null default false,   -- 미리보기(맛보기) — 배수 차감 예외 근거
  is_published boolean not null default false, -- 안전 기본값: 비공개
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (course_id, lesson_no)
);

-- 운영 메모(★★) — 별도 테이블 + staff 전용 RLS (승인 단서 1: published 행이 공개 SELECT 라
-- 같은 행의 컬럼은 anon 직접 쿼리로 읽힘 — 방어를 규약이 아닌 구조로).
create table public.lesson_staff_memos (
  lesson_id uuid primary key references public.course_lessons (lesson_id) on delete cascade,
  memo text not null,
  updated_by uuid references public.profiles (profile_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.lesson_videos (
  video_id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete restrict,
  drm_provider text not null,               -- 'kollus' / 'starplayer' … [벤더] 불투명
  drm_video_id text not null,               -- 외부 콘텐츠 ID — 학생 노출 금지(RLS staff 전용)
  duration_seconds int not null check (duration_seconds > 0), -- 배수 모수
  is_active boolean not null default true,  -- 교체 = 기존 false + 새 행 (append-only 이력)
  replaced_reason text,
  created_by uuid references public.profiles (profile_id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index lesson_videos_active_per_lesson on public.lesson_videos (lesson_id) where is_active;

create table public.lesson_materials (
  material_id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete cascade,
  title text not null,
  storage_path text not null,               -- 열람은 서버 판정 후 signed URL
  sort_order int not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

-- 노드↔회차 다대다 (★플랫폼 고유 — 약점 단원→재수강 루프. M2엔 테이블만, 소비는 M3+)
create table public.lesson_node_links (
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete cascade,
  node_id uuid not null references public.systematic_nodes (node_id) on delete cascade,
  created_by uuid references public.profiles (profile_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (lesson_id, node_id)
);

-- ─────────────────────────────────────────────────────────────
-- 2) 상품 확장 (§3.3) — 기존 subscription_plans 에 얹음
-- ─────────────────────────────────────────────────────────────

alter table public.subscription_plans
  drop constraint subscription_plans_product_kind_check;
alter table public.subscription_plans
  add constraint subscription_plans_product_kind_check
  check (product_kind in ('subject','bundle','membership','course','tpass'));
-- ('book' 은 예약 — 도서는 M4 order_items 가 books 직접 참조, plan 래퍼 불사용)

alter table public.subscription_plans
  add column sale_status text not null default 'scheduled'
  check (sale_status in ('scheduled','on_sale','paused','closed','hidden'));
-- 기존 상품 호환 백필(승인 단서 2 — 양방향 명시):
--   is_active=true  → on_sale (판매중)
--   is_active=false → hidden  (은퇴 상품: pro_monthly 등 — 재판매 계획 없고 노출 금지 = hidden.
--                              '종료(closed)'는 판매 이력 노출용 상태라 은퇴 상품엔 hidden 이 맞음)
update public.subscription_plans set sale_status = 'on_sale' where is_active = true;
update public.subscription_plans set sale_status = 'hidden' where is_active = false;

create table public.plan_courses (
  plan_id uuid not null references public.subscription_plans (plan_id) on delete cascade,
  course_id uuid not null references public.courses (course_id) on delete restrict,
  primary key (plan_id, course_id)
);

create table public.plan_policies (
  plan_id uuid primary key references public.subscription_plans (plan_id) on delete cascade,
  duration_days int check (duration_days > 0),
  fixed_end_date date,
  multiplier numeric(3,1) check (multiplier >= 1),  -- null=배수 미적용(무제한)
  pause_allowed boolean not null default false,
  pause_total_days int not null default 0,
  pause_max_count int not null default 0,
  pause_min_days int not null default 1,
  pause_max_days int not null default 30,
  allow_pc boolean not null default true,
  allow_mobile boolean not null default true,
  allow_download boolean not null default false,    -- [벤더]
  max_devices_pc int not null default 1,
  max_devices_mobile int not null default 1,
  extension_allowed boolean not null default false,
  extension_plan_ids uuid[] not null default '{}',  -- 연장 상품 연결
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (duration_days is not null or fixed_end_date is not null) -- 수강기간: 둘 중 하나 필수
);

-- ─────────────────────────────────────────────────────────────
-- 3) 영상 수강권 (§3.4)
-- ─────────────────────────────────────────────────────────────

create table public.enrollments (
  enrollment_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (profile_id) on delete cascade,
  course_id uuid not null references public.courses (course_id) on delete restrict, -- 에디션 고정
  plan_id uuid references public.subscription_plans (plan_id) on delete set null,   -- 정책 참조
  source text not null check (source in ('order','manual','migration','event')),
  order_item_id uuid,                        -- M4 order_items 생성 후 FK 승격(지금은 자리)
  granted_by uuid references public.profiles (profile_id) on delete set null,
  admin_note text,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,           -- 지급 시 plan_policies 로 계산해 저장(연장·정지로 변동)
  multiplier_snapshot numeric(3,1),          -- 지급 시점 스냅샷(null=배수 미적용)
  base_duration_snapshot_seconds int not null default 0, -- 지급 시점 course 총 재생시간. ★자동 재계산 금지(§4.5)
  status text not null default 'active' check (status in ('active','paused','expired','revoked')),
  revoked_at timestamptz,
  revoke_reason text,
  blocked_lesson_ids uuid[] not null default '{}',  -- 특정 회차 재생 차단
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index enrollments_user_idx on public.enrollments (user_id, status);
create index enrollments_course_idx on public.enrollments (course_id);

create table public.enrollment_pauses (
  pause_id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (enrollment_id) on delete cascade,
  requested_by uuid not null references public.profiles (profile_id) on delete cascade, -- 본인/관리자
  starts_on date not null,
  ends_on date not null,
  days int not null check (days > 0),
  resumed_at timestamptz,
  is_admin_exception boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.enrollment_admin_logs (
  log_id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (enrollment_id) on delete cascade,
  actor_id uuid references public.profiles (profile_id) on delete set null,
  action text not null,                      -- grant/extend/revoke/block/adjust_snapshot/pause_admin …
  before jsonb,
  after jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 4) 재생 판정 스냅 (§3.5) — M2 는 로그인·수강권·기간만 판정(배수·기기 스킵 플래그)
--    ★단서 1: 스킵 플래그는 M4 결제 오픈 전 반드시 ON — M4 오픈 체크리스트 1번.
-- ─────────────────────────────────────────────────────────────

create table public.playback_grants (
  grant_id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (profile_id) on delete cascade, -- null=비로그인 맛보기
  enrollment_id uuid references public.enrollments (enrollment_id) on delete set null, -- null=맛보기·무료
  lesson_id uuid not null references public.course_lessons (lesson_id) on delete cascade,
  video_id uuid not null references public.lesson_videos (video_id) on delete cascade,
  device_id uuid,                            -- M3 user_devices 생성 후 FK 승격
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,           -- 수 분 단기
  client_ip inet,
  user_agent text
);
create index playback_grants_user_idx on public.playback_grants (user_id, granted_at desc);

-- ─────────────────────────────────────────────────────────────
-- 5) RLS (§⑤) — 안전 기본값: 전 테이블 enable + 명시 정책만
-- ─────────────────────────────────────────────────────────────

alter table public.course_series enable row level security;
alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.lesson_staff_memos enable row level security;
alter table public.lesson_videos enable row level security;
alter table public.lesson_materials enable row level security;
alter table public.lesson_node_links enable row level security;
alter table public.plan_courses enable row level security;
alter table public.plan_policies enable row level security;
alter table public.enrollments enable row level security;
alter table public.enrollment_pauses enable row level security;
alter table public.enrollment_admin_logs enable row level security;
alter table public.playback_grants enable row level security;

-- 공개 카탈로그: 시리즈·published 강의·published 회차(staff 는 전량)
create policy course_series_select_all on public.course_series
  for select using (true);
create policy courses_select_published on public.courses
  for select using ((status = 'published' and deleted_at is null) or private.is_staff((select auth.uid())));
create policy course_lessons_select_published on public.course_lessons
  for select using ((is_published and deleted_at is null) or private.is_staff((select auth.uid())));
-- 운영 메모: staff 전용 (읽기·쓰기 모두)
create policy lesson_staff_memos_staff on public.lesson_staff_memos
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy lesson_materials_select_published on public.lesson_materials
  for select using (is_published or private.is_staff((select auth.uid())));
create policy lesson_node_links_select_all on public.lesson_node_links
  for select using (true);

-- drm_video_id 학생 노출 금지: lesson_videos 는 staff 만 select. 재생은 서버(service_role)가 grant 발급.
create policy lesson_videos_select_staff on public.lesson_videos
  for select using (private.is_staff((select auth.uid())));

-- 콘텐츠 쓰기: staff (등록 화면은 access duty 로 추가 게이트 — action 레벨)
create policy course_series_write_staff on public.course_series
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy courses_write_staff on public.courses
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy course_lessons_write_staff on public.course_lessons
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy lesson_videos_write_staff on public.lesson_videos
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy lesson_materials_write_staff on public.lesson_materials
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy lesson_node_links_write_staff on public.lesson_node_links
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

-- 상품 연결·정책: 공개 읽기(가격/정책 표시), 쓰기 staff
create policy plan_courses_select_all on public.plan_courses for select using (true);
create policy plan_courses_write_staff on public.plan_courses
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));
create policy plan_policies_select_all on public.plan_policies for select using (true);
create policy plan_policies_write_staff on public.plan_policies
  for all using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

-- 수강권: 본인 + staff 읽기. 쓰기는 서버 action(adminClient)만 — 학생/스태프 직접 쓰기 정책 없음.
create policy enrollments_select_own_or_staff on public.enrollments
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));
create policy enrollment_pauses_select_own_or_staff on public.enrollment_pauses
  for select using (
    exists (select 1 from public.enrollments e
            where e.enrollment_id = enrollment_pauses.enrollment_id
              and e.user_id = (select auth.uid()))
    or private.is_staff((select auth.uid()))
  );
create policy enrollment_admin_logs_select_staff on public.enrollment_admin_logs
  for select using (private.is_staff((select auth.uid())));

-- 재생 grant: 본인 read(디버그·CS)·staff read. 발급은 서버만.
create policy playback_grants_select_own_or_staff on public.playback_grants
  for select using (user_id = (select auth.uid()) or private.is_staff((select auth.uid())));

-- updated_at 트리거 — 기존 public.set_updated_at() 재사용(존재 확인 완료)
create trigger course_series_updated_at before update on public.course_series
  for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses
  for each row execute function public.set_updated_at();
create trigger course_lessons_updated_at before update on public.course_lessons
  for each row execute function public.set_updated_at();
create trigger plan_policies_updated_at before update on public.plan_policies
  for each row execute function public.set_updated_at();
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function public.set_updated_at();
