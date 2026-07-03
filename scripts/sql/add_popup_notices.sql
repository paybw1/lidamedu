-- 팝업 공지 — 운영자가 만드는 사이트 팝업(모달) 공지.
-- 노출 조건: is_active + (starts_at 없거나 지남) + (ends_at 없거나 안 지남).
-- 학생/비로그인 읽기는 노출 조건 행만, 쓰기·전체 열람은 manager+ (RLS).

create table if not exists public.popup_notices (
  notice_id   uuid primary key default gen_random_uuid(),
  title       text not null,
  body_md     text not null default '',
  link_url    text,
  link_label  text,
  starts_at   timestamptz,
  ends_at     timestamptz,
  is_active   boolean not null default false,
  created_by  uuid references public.profiles(profile_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.popup_notices enable row level security;

drop policy if exists popup_notices_select_visible on public.popup_notices;
create policy popup_notices_select_visible on public.popup_notices
  for select using (
    is_active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

drop policy if exists popup_notices_staff_manage on public.popup_notices;
create policy popup_notices_staff_manage on public.popup_notices
  for all using (
    exists (
      select 1 from public.profiles pr
      where pr.profile_id = auth.uid() and pr.role in ('manager', 'admin')
    )
  ) with check (
    exists (
      select 1 from public.profiles pr
      where pr.profile_id = auth.uid() and pr.role in ('manager', 'admin')
    )
  );

create index if not exists popup_notices_active_idx
  on public.popup_notices (is_active, starts_at, ends_at);
