-- feat-2-038 정리비교표 학생 공개 준비 — 열람 로그(유출방지 ⑤). 도해의 dohae_unit_views 와 같은 꼴.
-- ★읽기 공개(systematic_digests 의 SELECT 정책)는 이 파일에 없다 — 유출방지 코드가 배포된 뒤 따로 연다.

create table if not exists public.systematic_digest_views (
  view_id    uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  digest_id  uuid not null references public.systematic_digests(digest_id) on delete cascade,
  viewed_at  timestamptz not null default now()
);
create index if not exists systematic_digest_views_profile_time
  on public.systematic_digest_views (profile_id, viewed_at desc);

alter table public.systematic_digest_views enable row level security;
-- SELECT staff 만. INSERT 정책 없음 = 서버(service_role)만 기록한다.
drop policy if exists systematic_digest_views_staff_select on public.systematic_digest_views;
create policy systematic_digest_views_staff_select
  on public.systematic_digest_views
  for select
  using (private.is_staff(auth.uid()));
