-- 이용 가이드 허브 — 운영자가 작성하는 기능 사용법(짧은 글 + 유튜브 영상).
-- 학생: 발행본만 읽기(RLS). 작성·수정은 운영자 adminClient(manager+ action 게이트).
-- screen_key: 후속 ②(화면 안 ? 도움 버튼)에서 화면별 가이드 딥링크용 — 지금은 선택 입력.

create table if not exists public.guide_articles (
  guide_id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '시작하기',
  body_md text not null default '',
  youtube_url text,
  screen_key text,
  is_published boolean not null default false,
  display_order int not null default 0,
  created_by uuid references public.profiles(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.guide_articles is '이용 가이드 허브 콘텐츠 — 글+영상, 운영자 작성';

create index if not exists guide_articles_pub_idx
  on public.guide_articles (is_published, category, display_order);

alter table public.guide_articles enable row level security;

drop policy if exists guide_articles_select_published on public.guide_articles;
create policy guide_articles_select_published
  on public.guide_articles for select
  to authenticated
  using (is_published = true);
