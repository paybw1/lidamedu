-- 강의노트 유출방지 ③: 열람 로그 + 이상 패턴 알림.
-- 로그는 서버(/api/lecture-note-pages, service_role)만 기록 — insert 정책 없음.
-- staff 만 조회(감사·이상 확인용).

alter type public.staff_notification_kind add value if not exists 'lecture_note_abuse';

create table if not exists public.lecture_note_views (
  view_id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(profile_id) on delete cascade,
  kind text not null check (kind in ('src', 'res')),
  target_id uuid not null,
  from_page int not null,
  to_page int not null,
  viewed_at timestamptz not null default now()
);

comment on table public.lecture_note_views is
  '강의노트 페이지 이미지 서명 요청 로그(유출방지 ③) — 창(from~to) 단위. staff 열람은 미기록.';

create index if not exists lecture_note_views_profile_time_idx
  on public.lecture_note_views (profile_id, viewed_at desc);

alter table public.lecture_note_views enable row level security;

drop policy if exists lecture_note_views_staff_select on public.lecture_note_views;
create policy lecture_note_views_staff_select
  on public.lecture_note_views
  for select using (private.is_staff(auth.uid()));
