-- feat-3-604 S3 — 판 대조 후보 검수함 + 발행 RPC.
--
-- 후보는 스크립트(service_role)가 넣고, 원장·강사는 화면에서 판정만 한다.
-- 발행은 기존 추록·정오표 경로에 그대로 합류한다 — 새 발행 경로를 만들지 않는다.

create table if not exists public.book_diff_candidates (
  candidate_id uuid primary key default gen_random_uuid(),
  -- 쪽 번호가 어느 인쇄본 기준인지. 판본이 없으면 쪽수는 뜻이 없다.
  edition_id uuid not null references public.publication_editions(edition_id) on delete cascade,
  -- 한 번 돌린 대조의 이름(파일 mtime 기반) — 언제 뽑힌 후보인지 추적용.
  run_id text not null,
  -- 쪽·구분·변경 전후 글의 해시. 다시 적재해도 같은 후보를 같은 행으로 알아본다.
  fingerprint text not null,
  page_no integer,
  bucket text not null,
  change_type text not null check (change_type in ('수정', '추가', '삭제')),
  confidence text not null check (confidence in ('확실', '일부', '이동')),
  before_text text not null default '',
  after_text text not null default '',
  similarity numeric,
  -- 이번 대조에 안 나온 옛 후보는 지우지 않고 내린다(판정 보존).
  status text not null default 'current' check (status in ('current', 'superseded')),
  decision text not null default 'pending'
    check (decision in ('pending', 'errata', 'addendum', 'next_edition', 'not_a_change')),
  decision_note text,
  decided_by uuid references public.profiles(profile_id),
  decided_at timestamptz,
  -- 발행되면 만들어진 원장 행. 있으면 다시 발행하지 않는다.
  published_revision_id uuid references public.content_revisions(revision_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint book_diff_candidates_uniq unique (edition_id, fingerprint)
);

create index if not exists book_diff_candidates_worklist_idx
  on public.book_diff_candidates (edition_id, status, decision, page_no);

drop trigger if exists set_book_diff_candidates_updated_at on public.book_diff_candidates;
create trigger set_book_diff_candidates_updated_at
  before update on public.book_diff_candidates
  for each row execute function public.set_updated_at();

alter table public.book_diff_candidates enable row level security;

-- 검수함은 staff 전용이다. 판정 전 후보가 학생에게 새어 나가면 안 된다
-- (아직 낼지 말지 안 정한 개정 원고 내용이다).
drop policy if exists book_diff_staff_select on public.book_diff_candidates;
create policy book_diff_staff_select on public.book_diff_candidates
  for select using (private.is_staff(auth.uid()));

drop policy if exists book_diff_staff_update on public.book_diff_candidates;
create policy book_diff_staff_update on public.book_diff_candidates
  for update using (private.is_staff(auth.uid())) with check (private.is_staff(auth.uid()));

-- INSERT/DELETE 정책은 두지 않는다 — 적재는 service_role 스크립트만(dohae_blank_terms 선례).

comment on table public.book_diff_candidates is
  'feat-3-604 판 대조 후보 검수함. 적재=service_role 스크립트, 판정=staff, 발행=fn_publish_book_errata';

-- ─────────────────────────────────────────────────────────────────────
-- 발행 — 판정된 후보를 원장 메타 행으로 만들어 기존 정오표 시트에 실는다.
--
-- ★content_revisions 에는 staff INSERT 정책이 없다(여태 트리거만 넣던 테이블이다).
--   그래서 화면 액션이 직접 insert 하면 42501 이다 — 이 함수를 거친다.
-- ★메타 행 모양은 교재 오기 정오표 1·2호 선례를 따른다: 스냅샷 null(플랫폼 콘텐츠는
--   안 바뀐다) · apply_status='skipped' · merge_status='pending'(차기 판 정정 대상).
create or replace function public.fn_publish_book_errata(
  p_candidate_ids uuid[],
  p_errata_kind text default null,
  p_errata_severity text default 'normal',
  p_errata_reason text default ''
)
returns setof uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c record;
  v_content_id text;
  v_revision_id uuid;
  v_kind text;
  v_op text;
  v_title text;
begin
  -- 이중 가드: 화면 액션과 별개로 DB 에서도 발행 롤을 강제한다(fn_publish_errata 와 같은 모양).
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_publisher(auth.uid())) then
    raise exception '발행 권한이 없습니다 (원장·관리자 전용)';
  end if;

  for c in
    select * from book_diff_candidates
     where candidate_id = any(p_candidate_ids)
       and decision in ('errata', 'addendum')
       and published_revision_id is null
     order by page_no nulls last, candidate_id
  loop
    v_content_id := 'book:' || c.edition_id::text || ':' || c.fingerprint;
    v_kind := coalesce(p_errata_kind, case when c.decision = 'addendum' then 'addendum' else 'typo' end);
    v_op := case c.change_type when '추가' then 'INSERT' when '삭제' then 'DELETE' else 'UPDATE' end;
    v_title := coalesce(c.page_no::text || '쪽', '쪽 미상') || ' ' || c.bucket;

    -- 쪽 번호는 여기서 온다 — 시트 뷰가 content_map 을 조인해 page_no 를 읽는다.
    insert into publication_content_map (edition_id, content_type, content_id, page_no)
    values (c.edition_id, 'theory', v_content_id, c.page_no)
    on conflict do nothing;

    insert into content_revisions (
      content_type, content_id, op,
      before_snapshot, after_snapshot, changed_fields,
      notice_status, apply_status, merge_status,
      created_by, created_by_label, app_name, source_ref
    ) values (
      'theory', v_content_id, v_op,
      null, null, array['book_text'],
      'none', 'skipped', 'pending',
      auth.uid(), 'book_diff', 'book_diff',
      jsonb_build_object('candidate_id', c.candidate_id, 'run_id', c.run_id, 'page_no', c.page_no)
    )
    returning revision_id into v_revision_id;

    perform fn_publish_errata(
      array[v_revision_id],
      v_kind,
      coalesce(p_errata_severity, 'normal'),
      v_title,
      jsonb_build_object(
        'before_text', coalesce(nullif(c.before_text, ''), '없음'),
        'after_text', coalesce(nullif(c.after_text, ''), '삭제'),
        'regrade_requested', false
      ),
      p_errata_reason
    );

    update book_diff_candidates
       set published_revision_id = v_revision_id
     where candidate_id = c.candidate_id;

    return next v_revision_id;
  end loop;
end $$;

revoke all on function public.fn_publish_book_errata(uuid[], text, text, text) from public;
grant execute on function public.fn_publish_book_errata(uuid[], text, text, text) to authenticated, service_role;
