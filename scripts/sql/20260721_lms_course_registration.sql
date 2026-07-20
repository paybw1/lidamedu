-- feat-11-006 Phase 2 (A4a) — 강의 등록 운영 UX 통합: 스키마 기반
-- 설계: docs/features/강의플랫폼-추가설계-방향.md §3 Phase 2
-- 성격: 추가 전용. 기존 courses/course_series/subscription_plans 뮤테이션 경로 무변경.
--   신규: 카테고리 taxonomy(대/중/소) · 복수강사 join · 변경이력 audit · courses 소수 컬럼.
begin;

-- ── 카테고리 taxonomy(대/중/소) — self-referencing parent_id ──────────────────
create table if not exists public.course_categories (
  category_id uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.course_categories(category_id) on delete cascade, -- null=대분류
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists course_categories_parent_idx
  on public.course_categories(parent_id);

-- ── courses 컬럼: 강의 유형 · 카테고리 · 관리자 메모 · 고유번호 · 노출 ─────────
alter table public.courses
  add column if not exists course_type text,                         -- 무료특강/기본이론 등(앱 상수 lecture-type.ts)
  add column if not exists category_id uuid references public.course_categories(category_id) on delete set null,
  add column if not exists admin_memo  text,
  add column if not exists is_visible  boolean not null default true, -- 목록/카탈로그 노출(status=콘텐츠 준비도와 별개 축)
  add column if not exists public_no   int;                          -- 사람이 읽는 강의 고유번호(강의 C-{n})

-- 고유번호 시퀀스 + 기존 행 백필 + 기본값(신규 자동 부여).
create sequence if not exists public.course_public_no_seq;
update public.courses
  set public_no = nextval('public.course_public_no_seq')
  where public_no is null;
alter table public.courses
  alter column public_no set default nextval('public.course_public_no_seq');
-- 시퀀스를 현재 최대값 뒤로 정렬(백필 후).
select setval('public.course_public_no_seq',
  coalesce((select max(public_no) from public.courses), 0) + 1, false);

-- ── 복수 담당강사 join(course_series.instructor_id 는 대표강사로 보존) ──────────
create table if not exists public.course_instructors (
  course_id     uuid not null references public.courses(course_id) on delete cascade,
  instructor_id uuid not null references public.profiles(profile_id) on delete cascade,
  role          text,                              -- 대표/공동/조교 등(자유 text)
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (course_id, instructor_id)
);
create index if not exists course_instructors_instructor_idx
  on public.course_instructors(instructor_id);

-- ── 변경 이력 audit(강의 필드·목차 편집) — append-only, 불변 ────────────────
create table if not exists public.course_audit_logs (
  log_id     uuid primary key default gen_random_uuid(),
  course_id  uuid not null references public.courses(course_id) on delete cascade,
  actor_id   uuid references public.profiles(profile_id),
  action     text not null,                        -- update_basic/clone/publish/video_replace 등
  summary    text,                                 -- 사람이 읽는 변경 요약
  detail     jsonb,                                -- {field:{old,new}} 선택
  created_at timestamptz not null default now()
);
create index if not exists course_audit_logs_course_idx
  on public.course_audit_logs(course_id, created_at desc);

-- ── 트리거(updated_at) ────────────────────────────────────────────────────────
drop trigger if exists course_categories_updated_at on public.course_categories;
create trigger course_categories_updated_at before update on public.course_categories
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.course_categories  enable row level security;
alter table public.course_instructors enable row level security;
alter table public.course_audit_logs  enable row level security;

-- 카테고리·강사: 카탈로그/상세 노출 → 공개 읽기 + staff 쓰기(courses 관례).
drop policy if exists course_categories_select_all on public.course_categories;
create policy course_categories_select_all on public.course_categories for select using (true);
drop policy if exists course_categories_write_staff on public.course_categories;
create policy course_categories_write_staff on public.course_categories for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

drop policy if exists course_instructors_select_all on public.course_instructors;
create policy course_instructors_select_all on public.course_instructors for select using (true);
drop policy if exists course_instructors_write_staff on public.course_instructors;
create policy course_instructors_write_staff on public.course_instructors for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

-- 감사 로그: staff 조회·삽입만(수정/삭제 없음 = 불변).
drop policy if exists course_audit_logs_select_staff on public.course_audit_logs;
create policy course_audit_logs_select_staff on public.course_audit_logs for select
  using (private.is_staff((select auth.uid())));
drop policy if exists course_audit_logs_insert_staff on public.course_audit_logs;
create policy course_audit_logs_insert_staff on public.course_audit_logs for insert
  with check (private.is_staff((select auth.uid())));

commit;

select
  (select count(*) from public.courses where public_no is not null) as numbered,
  (select count(*) from public.course_categories) as categories,
  (select count(*) from public.course_instructors) as course_instructors;
