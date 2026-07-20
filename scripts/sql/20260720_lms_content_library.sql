-- feat-11-006 Phase 1 — 콜러스 콘텐츠 라이브러리 + 강의그룹 (구조 코어)
-- 설계: docs/features/강의플랫폼-추가설계-방향.md §2 판단 A
-- 성격: 추가 전용(additive). lesson_videos 의 drm_video_id/duration_seconds 는 그대로 두어
--       재생 판정(playback.server) 무변경. content_id 로 라이브러리를 참조만 추가한다.
begin;

-- ── 강의그룹: 콜러스 영상을 촬영/과정 단위로 묶는 카탈로그 ──────────────────
create table if not exists public.content_groups (
  group_id      uuid primary key default gen_random_uuid(),
  name          text not null,
  year          int,
  subject_code  text,                              -- 기존 과목 코드(text, FK 없음 — course_series 와 동일 관례)
  instructor_id uuid references public.profiles(profile_id),
  exam_track    text,                              -- 시험구분(1차/2차 등) — 자유 text
  course_type   text,                              -- 과정유형(기본이론/실전 등) — 자유 text
  book_title    text,                              -- 교재명
  staff_memo    text,
  created_by    uuid references public.profiles(profile_id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ── 콘텐츠 라이브러리: 콜러스 미디어 자산(동기화 대상). 회차와 분리 = 재사용의 토대 ──
create table if not exists public.video_contents (
  content_id           uuid primary key default gen_random_uuid(),
  drm_provider         text not null default 'kollus',
  content_key          text not null,              -- 콜러스 mckey(=기존 drm_video_id)
  title                text not null,
  original_filename    text,
  duration_seconds     int,                        -- 콜러스 자동 수집(동기화 전 null 허용)
  encoding_status      text not null default 'unknown',  -- unknown/encoding/available/error/deleted
  group_id             uuid references public.content_groups(group_id) on delete set null,
  completion_threshold numeric not null default 0.9 check (completion_threshold > 0 and completion_threshold <= 1), -- 진도율 인정 기준(90/95%)
  use_status           text not null default 'in_use',   -- in_use/stopped(재생 즉시 차단)
  is_active            boolean not null default true,    -- false=신규 강의 연결 불가(기존 수강 유지)
  admin_memo           text,
  synced_at            timestamptz,                -- 마지막 콜러스 동기화 시각(null=수동 등록)
  created_by           uuid references public.profiles(profile_id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  unique (drm_provider, content_key)              -- 중복 등록 방지(동기화 upsert 키)
);
create index if not exists video_contents_group_idx on public.video_contents(group_id);

-- ── lesson_videos 에 content_id 참조 추가(추가 전용, 기존 컬럼 보존) ──────────
alter table public.lesson_videos
  add column if not exists content_id uuid references public.video_contents(content_id);
create index if not exists lesson_videos_content_idx on public.lesson_videos(content_id);

-- ── 백필: 기존 lesson_videos 를 (provider, key) distinct 로 라이브러리에 이관 후 연결 ──
insert into public.video_contents
  (drm_provider, content_key, title, duration_seconds, encoding_status, use_status, is_active, synced_at)
select lv.drm_provider,
       lv.drm_video_id,
       coalesce(min(cl.title), lv.drm_video_id) as title,   -- 대표 회차명(없으면 키)
       max(lv.duration_seconds)                as duration_seconds,
       'available', 'in_use', true, null
from public.lesson_videos lv
left join public.course_lessons cl on cl.lesson_id = lv.lesson_id
group by lv.drm_provider, lv.drm_video_id
on conflict (drm_provider, content_key) do nothing;

update public.lesson_videos lv
set content_id = vc.content_id
from public.video_contents vc
where vc.drm_provider = lv.drm_provider
  and vc.content_key  = lv.drm_video_id
  and lv.content_id is null;

-- ── updated_at 트리거(기존 set_updated_at 재사용) ─────────────────────────────
drop trigger if exists content_groups_updated_at on public.content_groups;
create trigger content_groups_updated_at before update on public.content_groups
  for each row execute function public.set_updated_at();
drop trigger if exists video_contents_updated_at on public.video_contents;
create trigger video_contents_updated_at before update on public.video_contents
  for each row execute function public.set_updated_at();

-- ── RLS: 콘텐츠 키는 학생 비노출 → lesson_videos 와 동일하게 staff 전용 ─────────
alter table public.content_groups enable row level security;
alter table public.video_contents enable row level security;

drop policy if exists content_groups_all_staff on public.content_groups;
create policy content_groups_all_staff on public.content_groups for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

drop policy if exists video_contents_all_staff on public.video_contents;
create policy video_contents_all_staff on public.video_contents for all
  using (private.is_staff((select auth.uid()))) with check (private.is_staff((select auth.uid())));

commit;

-- 검증용 출력
select
  (select count(*) from public.video_contents) as contents,
  (select count(*) from public.content_groups) as groups,
  (select count(*) from public.lesson_videos where content_id is not null) as linked,
  (select count(*) from public.lesson_videos where content_id is null) as unlinked;
