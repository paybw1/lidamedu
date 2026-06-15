-- feat-6-010 반(cohort)별 커뮤니티 게시판 — 테이블 + RLS (assignments 정책 복제, 조회·쓰기 DB 강제)
-- 운영 DB(mcgdoplo) 적용. 롤백: scripts/sql/20260615_cohort_boards_rollback.sql
-- 재사용 헬퍼: private.is_staff(uid) / private.is_manager(uid) / public.user_is_in_cohort / public.user_owns_cohort
-- 접근 단위: board ─(M:N cohort_board_cohorts)─ cohort. 글/댓글은 board 권한에 위임.

-- ── enum: 쓰기 범위 (공지형 staff / 소통형 members) ──────────────────────
do $mig$ begin
  if not exists (select 1 from pg_type where typname = 'cohort_board_write_scope') then
    create type cohort_board_write_scope as enum ('staff', 'members');
  end if;
end $mig$;

-- ── tables ────────────────────────────────────────────────────────────────
create table if not exists cohort_boards (
  board_id    uuid primary key default gen_random_uuid(),
  title       text not null check (length(title) between 1 and 200),
  description text check (description is null or length(description) <= 2000),
  write_scope cohort_board_write_scope not null default 'members',
  created_by  uuid references profiles(profile_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table if not exists cohort_board_cohorts (
  board_id  uuid not null references cohort_boards(board_id) on delete cascade,
  cohort_id uuid not null references cohorts(cohort_id) on delete cascade,
  added_by  uuid references profiles(profile_id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (board_id, cohort_id)
);
create index if not exists cohort_board_cohorts_cohort_idx on cohort_board_cohorts (cohort_id);

create table if not exists cohort_board_posts (
  post_id    uuid primary key default gen_random_uuid(),
  board_id   uuid not null references cohort_boards(board_id) on delete cascade,
  author_id  uuid references profiles(profile_id) on delete set null,
  title      text not null check (length(title) between 1 and 200),
  body_md    text not null check (length(body_md) between 1 and 20000),
  is_pinned  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cohort_board_posts_board_idx on cohort_board_posts (board_id) where deleted_at is null;

create table if not exists cohort_board_comments (
  comment_id uuid primary key default gen_random_uuid(),
  post_id    uuid not null references cohort_board_posts(post_id) on delete cascade,
  author_id  uuid references profiles(profile_id) on delete set null,
  body_md    text not null check (length(body_md) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists cohort_board_comments_post_idx on cohort_board_comments (post_id) where deleted_at is null;

-- ── updated_at 트리거 ──────────────────────────────────────────────────────
drop trigger if exists set_updated_at on cohort_boards;
create trigger set_updated_at before update on cohort_boards
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on cohort_board_posts;
create trigger set_updated_at before update on cohort_board_posts
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on cohort_board_comments;
create trigger set_updated_at before update on cohort_board_comments
  for each row execute function public.set_updated_at();

-- ── 접근 판정 헬퍼 (SECURITY DEFINER — RLS 우회로 링크/멤버십 평가; 기존 헬퍼 스타일) ──
-- 조회: 연결 cohort 중 소속 학생 OR 담당 강사 OR manager
create or replace function public.user_can_read_cohort_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select private.is_manager(p_user_id) or exists (
    select 1 from cohort_board_cohorts cbc
    where cbc.board_id = p_board_id
      and (public.user_is_in_cohort(cbc.cohort_id, p_user_id)
           or public.user_owns_cohort(cbc.cohort_id, p_user_id))
  );
$fn$;

-- 관리(게시판 수정/삭제, 글 staff 쓰기·반 내 관리): 담당 강사(연결 cohort owner) OR manager
create or replace function public.user_manages_cohort_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select private.is_manager(p_user_id) or exists (
    select 1 from cohort_board_cohorts cbc
    where cbc.board_id = p_board_id
      and public.user_owns_cohort(cbc.cohort_id, p_user_id)
  );
$fn$;

-- 글쓰기 가능: 관리권 OR (members형 게시판 + 연결 cohort 소속 학생)
create or replace function public.user_can_write_cohort_board(p_board_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select public.user_manages_cohort_board(p_board_id, p_user_id) or exists (
    select 1 from cohort_boards b
    join cohort_board_cohorts cbc on cbc.board_id = b.board_id
    where b.board_id = p_board_id
      and b.deleted_at is null
      and b.write_scope = 'members'
      and public.user_is_in_cohort(cbc.cohort_id, p_user_id)
  );
$fn$;

-- 댓글용 — post → board 위임 (RLS 테이블 직접참조 회피)
create or replace function public.user_can_read_cohort_post(p_post_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (select 1 from cohort_board_posts p where p.post_id = p_post_id
    and p.deleted_at is null and public.user_can_read_cohort_board(p.board_id, p_user_id));
$fn$;
create or replace function public.user_can_write_cohort_post(p_post_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (select 1 from cohort_board_posts p where p.post_id = p_post_id
    and p.deleted_at is null and public.user_can_write_cohort_board(p.board_id, p_user_id));
$fn$;
create or replace function public.user_manages_cohort_post(p_post_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (select 1 from cohort_board_posts p where p.post_id = p_post_id
    and public.user_manages_cohort_board(p.board_id, p_user_id));
$fn$;

-- ── soft-delete RPC (SECURITY DEFINER — SELECT RLS(deleted_at IS NULL) 우회, community 패턴) ──
create or replace function public.soft_delete_cohort_board_post(p_post_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not exists (select 1 from cohort_board_posts p
    where p.post_id = p_post_id and p.deleted_at is null
      and ((p.author_id = auth.uid() and public.user_can_write_cohort_board(p.board_id, auth.uid()))
           or public.user_manages_cohort_board(p.board_id, auth.uid())))
  then raise exception 'not authorized to delete post %', p_post_id using errcode = '42501'; end if;
  update cohort_board_posts set deleted_at = now() where post_id = p_post_id;
end $fn$;

create or replace function public.soft_delete_cohort_board_comment(p_comment_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_post uuid; v_author uuid;
begin
  select post_id, author_id into v_post, v_author from cohort_board_comments
    where comment_id = p_comment_id and deleted_at is null;
  if v_post is null then raise exception 'comment not found' using errcode = '42501'; end if;
  if not ((v_author = auth.uid() and public.user_can_write_cohort_post(v_post, auth.uid()))
          or public.user_manages_cohort_post(v_post, auth.uid()))
  then raise exception 'not authorized to delete comment %', p_comment_id using errcode = '42501'; end if;
  update cohort_board_comments set deleted_at = now() where comment_id = p_comment_id;
end $fn$;

create or replace function public.soft_delete_cohort_board(p_board_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not exists (select 1 from cohort_boards b
    where b.board_id = p_board_id and b.deleted_at is null
      and (private.is_manager(auth.uid()) or b.created_by = auth.uid()
           or public.user_manages_cohort_board(b.board_id, auth.uid())))
  then raise exception 'not authorized to delete board %', p_board_id using errcode = '42501'; end if;
  update cohort_boards set deleted_at = now() where board_id = p_board_id;
end $fn$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table cohort_boards         enable row level security;
alter table cohort_board_cohorts  enable row level security;
alter table cohort_board_posts    enable row level security;
alter table cohort_board_comments enable row level security;

grant select, insert, update, delete on cohort_boards, cohort_board_cohorts, cohort_board_posts, cohort_board_comments to authenticated;

-- cohort_boards
drop policy if exists cohort_boards_read on cohort_boards;
create policy cohort_boards_read on cohort_boards for select to authenticated
  using (deleted_at is null
    and (public.user_can_read_cohort_board(board_id, auth.uid()) or created_by = auth.uid()));
drop policy if exists cohort_boards_insert on cohort_boards;
create policy cohort_boards_insert on cohort_boards for insert to authenticated
  with check (private.is_staff(auth.uid()) and created_by = auth.uid());
drop policy if exists cohort_boards_update on cohort_boards;
create policy cohort_boards_update on cohort_boards for update to authenticated
  using (private.is_manager(auth.uid()) or created_by = auth.uid()
         or public.user_manages_cohort_board(board_id, auth.uid()))
  with check (private.is_manager(auth.uid()) or created_by = auth.uid()
         or public.user_manages_cohort_board(board_id, auth.uid()));
-- (hard delete 없음 — soft_delete_cohort_board RPC 만)

-- cohort_board_cohorts (접근 반 지정): 자기 소유 cohort 만 연결, 단 게시판 관리권/생성자/manager 한정
drop policy if exists cbc_read on cohort_board_cohorts;
create policy cbc_read on cohort_board_cohorts for select to authenticated
  using (public.user_can_read_cohort_board(board_id, auth.uid()));
drop policy if exists cbc_write on cohort_board_cohorts;
create policy cbc_write on cohort_board_cohorts for all to authenticated
  using (private.is_manager(auth.uid())
    or (public.user_owns_cohort(cohort_id, auth.uid())
        and (public.user_manages_cohort_board(board_id, auth.uid())
             or exists (select 1 from cohort_boards b where b.board_id = cohort_board_cohorts.board_id and b.created_by = auth.uid()))))
  with check (private.is_manager(auth.uid())
    or (public.user_owns_cohort(cohort_id, auth.uid())
        and (public.user_manages_cohort_board(board_id, auth.uid())
             or exists (select 1 from cohort_boards b where b.board_id = cohort_board_cohorts.board_id and b.created_by = auth.uid()))));

-- cohort_board_posts
drop policy if exists cbp_read on cohort_board_posts;
create policy cbp_read on cohort_board_posts for select to authenticated
  using (deleted_at is null and public.user_can_read_cohort_board(board_id, auth.uid()));
drop policy if exists cbp_insert on cohort_board_posts;
create policy cbp_insert on cohort_board_posts for insert to authenticated
  with check (author_id = auth.uid() and public.user_can_write_cohort_board(board_id, auth.uid()));
drop policy if exists cbp_update on cohort_board_posts;
create policy cbp_update on cohort_board_posts for update to authenticated
  using ((author_id = auth.uid() and public.user_can_write_cohort_board(board_id, auth.uid()))
         or public.user_manages_cohort_board(board_id, auth.uid()))
  with check ((author_id = auth.uid() and public.user_can_write_cohort_board(board_id, auth.uid()))
         or public.user_manages_cohort_board(board_id, auth.uid()));

-- cohort_board_comments (post → board 위임)
drop policy if exists cbcm_read on cohort_board_comments;
create policy cbcm_read on cohort_board_comments for select to authenticated
  using (deleted_at is null and public.user_can_read_cohort_post(post_id, auth.uid()));
drop policy if exists cbcm_insert on cohort_board_comments;
create policy cbcm_insert on cohort_board_comments for insert to authenticated
  with check (author_id = auth.uid() and public.user_can_write_cohort_post(post_id, auth.uid()));
drop policy if exists cbcm_update on cohort_board_comments;
create policy cbcm_update on cohort_board_comments for update to authenticated
  using ((author_id = auth.uid() and public.user_can_write_cohort_post(post_id, auth.uid()))
         or public.user_manages_cohort_post(post_id, auth.uid()))
  with check ((author_id = auth.uid() and public.user_can_write_cohort_post(post_id, auth.uid()))
         or public.user_manages_cohort_post(post_id, auth.uid()));
