-- feat-6-011 고객센터 문의 게시판 — 테이블 + RLS + soft-delete RPC.
-- 운영 DB(mcgdoplo). 접근: 작성자 본인 OR staff OR 공개글(is_private=false). 조회·쓰기 DB 강제.
-- 재사용 헬퍼: private.is_staff(uid) / public.set_updated_at()

-- ── enums ────────────────────────────────────────────────────────────────
do $mig$ begin
  if not exists (select 1 from pg_type where typname = 'cs_inquiry_category') then
    create type cs_inquiry_category as enum
      ('payment', 'course', 'book', 'account', 'site', 'etc');
  end if;
  if not exists (select 1 from pg_type where typname = 'cs_inquiry_status') then
    create type cs_inquiry_status as enum ('open', 'answered', 'closed');
  end if;
end $mig$;

-- ── display_no 전역 시퀀스 (문의번호 #N, 1회 부여 후 불변) ──────────────────
create sequence if not exists cs_inquiries_display_no_seq;

-- ── tables ────────────────────────────────────────────────────────────────
create table if not exists cs_inquiries (
  inquiry_id  uuid primary key default gen_random_uuid(),
  display_no  bigint not null default nextval('cs_inquiries_display_no_seq'),
  author_id   uuid references profiles(profile_id) on delete set null,
  category    cs_inquiry_category not null default 'etc',
  title       text not null check (length(title) between 1 and 200),
  body_md     text not null check (length(body_md) between 1 and 20000),
  is_private  boolean not null default true,   -- 문의는 개인정보 포함 가능 → 기본 비공개(작성자+staff)
  status      cs_inquiry_status not null default 'open',
  answered_by uuid references profiles(profile_id) on delete set null,
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists cs_inquiries_display_no_key on cs_inquiries (display_no);
create index if not exists cs_inquiries_author_idx on cs_inquiries (author_id) where deleted_at is null;
create index if not exists cs_inquiries_status_idx on cs_inquiries (status) where deleted_at is null;
create index if not exists cs_inquiries_created_idx on cs_inquiries (created_at desc) where deleted_at is null;

create table if not exists cs_inquiry_replies (
  reply_id   uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references cs_inquiries(inquiry_id) on delete cascade,
  role       text not null check (role in ('student', 'staff')),
  author_id  uuid references profiles(profile_id) on delete set null,
  body_md    text not null check (length(body_md) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cs_inquiry_replies_inquiry_idx
  on cs_inquiry_replies (inquiry_id, created_at) where deleted_at is null;

-- ── updated_at 트리거 ──────────────────────────────────────────────────────
drop trigger if exists set_updated_at on cs_inquiries;
create trigger set_updated_at before update on cs_inquiries
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on cs_inquiry_replies;
create trigger set_updated_at before update on cs_inquiry_replies
  for each row execute function public.set_updated_at();

-- ── 접근 판정 헬퍼 (SECURITY DEFINER — RLS 재귀 회피) ────────────────────────
-- 조회: 작성자 OR staff OR 공개글
create or replace function public.user_can_read_cs_inquiry(p_inquiry_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from cs_inquiries i
    where i.inquiry_id = p_inquiry_id and i.deleted_at is null
      and (i.author_id = p_user_id or private.is_staff(p_user_id) or i.is_private = false)
  );
$fn$;
-- 답글: 작성자 본인 OR staff (공개글이어도 제3자는 답글 불가)
create or replace function public.user_can_reply_cs_inquiry(p_inquiry_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from cs_inquiries i
    where i.inquiry_id = p_inquiry_id and i.deleted_at is null
      and (i.author_id = p_user_id or private.is_staff(p_user_id))
  );
$fn$;

-- ── soft-delete RPC (SELECT RLS 가 deleted_at IS NULL 이라 직접 UPDATE 불가) ──
create or replace function public.soft_delete_cs_inquiry(p_inquiry_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not exists (select 1 from cs_inquiries i
    where i.inquiry_id = p_inquiry_id and i.deleted_at is null
      and (i.author_id = auth.uid() or private.is_staff(auth.uid())))
  then raise exception 'not authorized to delete inquiry %', p_inquiry_id using errcode = '42501'; end if;
  update cs_inquiries set deleted_at = now() where inquiry_id = p_inquiry_id;
end $fn$;

create or replace function public.soft_delete_cs_inquiry_reply(p_reply_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_author uuid;
begin
  select author_id into v_author from cs_inquiry_replies
    where reply_id = p_reply_id and deleted_at is null;
  if v_author is null then raise exception 'reply not found' using errcode = '42501'; end if;
  if not (v_author = auth.uid() or private.is_staff(auth.uid()))
  then raise exception 'not authorized to delete reply %', p_reply_id using errcode = '42501'; end if;
  update cs_inquiry_replies set deleted_at = now() where reply_id = p_reply_id;
end $fn$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table cs_inquiries       enable row level security;
alter table cs_inquiry_replies enable row level security;
grant select, insert, update on cs_inquiries, cs_inquiry_replies to authenticated;

-- cs_inquiries
drop policy if exists cs_inquiries_read on cs_inquiries;
create policy cs_inquiries_read on cs_inquiries for select to authenticated
  using (deleted_at is null
    and (author_id = auth.uid() or private.is_staff(auth.uid()) or is_private = false));
drop policy if exists cs_inquiries_insert on cs_inquiries;
create policy cs_inquiries_insert on cs_inquiries for insert to authenticated
  with check (author_id = auth.uid());
-- 작성자는 미답변(open) 상태에서만 자기 글 수정, staff 는 상시(답변·상태변경).
drop policy if exists cs_inquiries_update on cs_inquiries;
create policy cs_inquiries_update on cs_inquiries for update to authenticated
  using ((author_id = auth.uid() and status = 'open') or private.is_staff(auth.uid()))
  with check ((author_id = auth.uid()) or private.is_staff(auth.uid()));
-- (hard delete 없음 — soft_delete_cs_inquiry RPC 만)

-- cs_inquiry_replies (inquiry 위임)
drop policy if exists cs_replies_read on cs_inquiry_replies;
create policy cs_replies_read on cs_inquiry_replies for select to authenticated
  using (deleted_at is null and public.user_can_read_cs_inquiry(inquiry_id, auth.uid()));
drop policy if exists cs_replies_insert on cs_inquiry_replies;
create policy cs_replies_insert on cs_inquiry_replies for insert to authenticated
  with check (author_id = auth.uid()
    and public.user_can_reply_cs_inquiry(inquiry_id, auth.uid())
    and (role <> 'staff' or private.is_staff(auth.uid())));
drop policy if exists cs_replies_update on cs_inquiry_replies;
create policy cs_replies_update on cs_inquiry_replies for update to authenticated
  using (author_id = auth.uid() or private.is_staff(auth.uid()))
  with check (author_id = auth.uid() or private.is_staff(auth.uid()));
