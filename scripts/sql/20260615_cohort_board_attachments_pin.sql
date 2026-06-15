-- feat-6-010 반별 게시판 ③b — 첨부(cohort_board_post_attachments) + 고정(pin) 가드.
-- 운영 DB(mcgdoplo) 적용. 롤백: scripts/sql/20260615_cohort_board_attachments_pin_rollback.sql
-- 첨부 접근통제 = RLS: read=글 읽기권 / insert·delete=글 작성자(쓰기권) OR 게시판 관리자.
-- 모든 storage 접근은 adminClient(service_role)로만 → 버킷 storage.objects 정책 불필요(community 패턴).
-- pin = manager 전용 RPC + 가드 트리거(비manager 의 직접 is_pinned 변경 차단).

-- ── enum: 첨부 종류 (community 와 동일 값, 독립 타입) ──────────────────────
do $mig$ begin
  if not exists (select 1 from pg_type where typname = 'cohort_board_attachment_kind') then
    create type cohort_board_attachment_kind as enum ('image', 'pdf', 'file');
  end if;
end $mig$;

-- ── 첨부 테이블 (hard delete + 블롭 제거, community 패턴 — soft delete 아님) ──
create table if not exists cohort_board_post_attachments (
  attachment_id     uuid primary key default gen_random_uuid(),
  post_id           uuid not null references cohort_board_posts(post_id) on delete cascade,
  kind              cohort_board_attachment_kind not null,
  path              text not null,
  original_filename text not null,
  size_bytes        integer not null,
  mime              text not null,
  sort_order        integer not null default 0,
  uploaded_by       uuid references profiles(profile_id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists cohort_board_post_attachments_post_idx
  on cohort_board_post_attachments (post_id, sort_order);

-- ── 첨부 권한 헬퍼: 글 작성자(쓰기권) OR 게시판 관리자 ──────────────────────
create or replace function public.user_can_attach_cohort_post(p_post_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from cohort_board_posts p
    where p.post_id = p_post_id and p.deleted_at is null
      and ((p.author_id = p_user_id and public.user_can_write_cohort_board(p.board_id, p_user_id))
           or public.user_manages_cohort_board(p.board_id, p_user_id))
  );
$fn$;

-- ── 첨부 RLS ────────────────────────────────────────────────────────────────
alter table cohort_board_post_attachments enable row level security;
grant select, insert, delete on cohort_board_post_attachments to authenticated;

drop policy if exists cbpa_read on cohort_board_post_attachments;
create policy cbpa_read on cohort_board_post_attachments for select to authenticated
  using (public.user_can_read_cohort_post(post_id, auth.uid()));
drop policy if exists cbpa_insert on cohort_board_post_attachments;
create policy cbpa_insert on cohort_board_post_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.user_can_attach_cohort_post(post_id, auth.uid()));
drop policy if exists cbpa_delete on cohort_board_post_attachments;
create policy cbpa_delete on cohort_board_post_attachments for delete to authenticated
  using (public.user_can_attach_cohort_post(post_id, auth.uid()));

-- ── 스토리지 버킷 (private; 접근은 adminClient 로만) ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('cohort-board-attachments', 'cohort-board-attachments', false, 10485760)
on conflict (id) do nothing;

-- ── 고정(pin) — manager 전용 RPC ─────────────────────────────────────────────
create or replace function public.set_cohort_board_post_pinned(p_post_id uuid, p_pinned boolean)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_board uuid;
begin
  select board_id into v_board from cohort_board_posts
    where post_id = p_post_id and deleted_at is null;
  if v_board is null then raise exception 'post not found' using errcode = '42501'; end if;
  if not public.user_manages_cohort_board(v_board, auth.uid())
    then raise exception 'not authorized to pin post %', p_post_id using errcode = '42501'; end if;
  update cohort_board_posts set is_pinned = p_pinned where post_id = p_post_id;
end $fn$;
grant execute on function public.set_cohort_board_post_pinned(uuid, boolean) to authenticated;

-- ── pin 가드 트리거 — 비manager 의 직접 is_pinned 변경 차단(직접 PostgREST UPDATE 방어) ──
-- RPC 경유든 직접 UPDATE 든 is_pinned 가 바뀌면 auth.uid() 의 관리권을 확인.
-- (set_updated_at 트리거와 공존; 이름순 guard_pin 이 먼저 — BEFORE UPDATE 순서 무관)
create or replace function public.guard_cohort_board_post_pin()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.is_pinned is distinct from old.is_pinned
     and not public.user_manages_cohort_board(old.board_id, auth.uid())
  then raise exception 'only board managers can pin/unpin post' using errcode = '42501'; end if;
  return new;
end $fn$;
drop trigger if exists guard_pin on cohort_board_posts;
create trigger guard_pin before update on cohort_board_posts
  for each row execute function public.guard_cohort_board_post_pin();
