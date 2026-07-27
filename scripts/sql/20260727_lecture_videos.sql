-- feat-12-002 — 강의 홈(/lecture/home) 짧은 영상 섹션(공부방법·맛보기).
--   공개 열람(anon 포함) 마케팅 영상. 두 공급자:
--     youtube : youtube_url 임베드(무료·공개)
--     kollus  : content_id → video_contents 콜러스 클립. 랜딩 loader 가 서버에서
--               buildKollusWebTokenUrl 로 서명 URL 생성(수강권 게이트 없이 mckey 만으로 재생).
--   ★맛보기(kollus)는 반드시 별도로 잘라 올린 짧은 클립을 지정할 것 — 전체 유료강의 지정 금지
--     (공개 재생되어 강의가 통째로 새어나감). 기술 강제 불가 → 운영/UI 경고로 관리.
--   패턴은 exam_notices/lecture_schedules 와 동일(공개읽기 RLS + staff 쓰기 + soft delete).
create table if not exists public.lecture_videos (
  video_id        uuid primary key default gen_random_uuid(),
  title           text not null check (length(title) between 1 and 200),
  description     text,
  category        text not null default 'study_method'
                    check (category in ('study_method', 'teaser', 'etc')),
  provider        text not null default 'youtube'
                    check (provider in ('youtube', 'kollus')),
  youtube_url     text,
  content_id      uuid references public.video_contents (content_id) on delete set null,
  thumbnail_url   text,
  linked_plan_id  uuid references public.subscription_plans (plan_id) on delete set null,
  duration_label  text,
  published       boolean not null default true,
  display_order   integer not null default 0,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  -- 공급자별 소스 필드 무결성: youtube→youtube_url, kollus→content_id 필수.
  constraint lecture_videos_source_ck check (
    (provider = 'youtube' and youtube_url is not null)
    or (provider = 'kollus' and content_id is not null)
  )
);

create index if not exists lecture_videos_public_idx
  on public.lecture_videos (category, display_order, created_at desc)
  where deleted_at is null and published;

drop trigger if exists set_updated_at on public.lecture_videos;
create trigger set_updated_at before update on public.lecture_videos
  for each row execute function public.set_updated_at();

alter table public.lecture_videos enable row level security;
grant select on public.lecture_videos to anon, authenticated;
grant insert, update on public.lecture_videos to authenticated;

drop policy if exists lecture_videos_read on public.lecture_videos;
create policy lecture_videos_read on public.lecture_videos for select to anon, authenticated
  using (deleted_at is null and (published or private.is_staff((select auth.uid()))));

drop policy if exists lecture_videos_write on public.lecture_videos;
create policy lecture_videos_write on public.lecture_videos for all to authenticated
  using (private.is_staff((select auth.uid())))
  with check (private.is_staff((select auth.uid())));
