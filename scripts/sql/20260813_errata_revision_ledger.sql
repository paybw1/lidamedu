-- ============================================================
-- errata Phase 1 — 추록/정오표 개정 원장 (append-only)
--
-- 근거 문서:
--   docs/errata/errata-phase01-instruction.md   §2.1·§2.2·§2.5·§2.6 (v1.1)
--   docs/errata/errata-phase1-decisions-v1.2.1.md §2·§3·§4 (§2.3/§2.4 대체)
--   docs/errata/phase0-audit-report.md          placeholder 실측 치환
--
-- 치환값 (감사 보고서 A1·A2·A6):
--   article_revisions node컬럼      → 없음 → null
--   problems_pk / node컬럼          → problem_id / primary_node_id
--   choices_pk / 선지번호컬럼       → choice_id / choice_index
--   problem_choices 제외컬럼        → (없음 — A6)
--   problems 제외컬럼               → updated_at (search_tsv 없음 — A6)
--   cases pk/node/과목/제외         → case_id / primary_node_id / subject_laws /
--     updated_at,search_tsv,official_text_checked_at,official_text_check_count,
--     official_text_unavailable,pending_primary_node_id
--
-- 문서 대비 편차 (검토 요청 — 본문 주석 [편차] 표기):
--   D1. fn_open/close_suppress_window 에 권한 가드 추가 (staff 또는 service_role)
--   D2. 운영 뷰 2종에 security_invoker = on (owner 우회로 RLS 무력화 방지)
--   D3. revision_suppress_windows RLS 활성 (staff select만)
--   D4. problems/choices subject_ref 에 science_subject 병행 보존
--
-- 적용:  node scripts/run-prod-sql.mjs scripts/sql/20260813_errata_revision_ledger.sql
-- 롤백:  scripts/sql/20260813_errata_revision_ledger_rollback.sql (트리거·함수만 제거)
-- ============================================================
begin;

-- ────────────────────────────────────────────────────────────
-- 1. 원장 테이블 (지시서 v1.1 §2.1 그대로)
-- ────────────────────────────────────────────────────────────
create table if not exists content_revisions (
  revision_id      uuid primary key default gen_random_uuid(),

  -- ── 대상 식별 ──────────────────────────────────
  content_type     text not null
    check (content_type in ('statute','precedent','mcq','essay','theory')),
  content_id       text not null,
  node_id          text,
  subject_code     text,

  -- ── 변경 실체 (불변) ───────────────────────────
  op               text not null check (op in ('INSERT','UPDATE','DELETE')),
  before_snapshot  jsonb,
  after_snapshot   jsonb,
  changed_fields   text[] not null default '{}',

  -- ── 축A: 고지 (Phase 3~4에서 사용) ─────────────
  notice_status    text not null default 'none'
    check (notice_status in ('none','pending','published','withdrawn')),
  errata_kind      text
    check (errata_kind is null or errata_kind in
      ('typo','law_amend','precedent_change','addendum','answer_change','deletion')),
  errata_severity  text
    check (errata_severity is null or errata_severity in ('critical','normal','minor')),
  errata_title     text,
  errata_payload   jsonb,
  errata_reason    text,
  legal_basis      jsonb,
  published_at     timestamptz,

  -- ── 축B: 콘텐츠 반영 ───────────────────────────
  apply_status     text not null default 'applied'
    check (apply_status in ('applied','scheduled','pending','skipped','reverted')),
  applied_at       timestamptz default now(),
  scheduled_for    date,
  pending_payload  jsonb,

  -- ── 축C: 판본 병합 ─────────────────────────────
  merge_status     text not null default 'pending'
    check (merge_status in ('pending','merged','excluded')),
  source_edition_id      uuid,
  merged_into_edition_id uuid,
  merged_at        timestamptz,

  -- ── 수험 도메인 ────────────────────────────────
  effective_date         date,
  applies_from_exam_round int,
  requires_regrade       boolean not null default false,

  -- ── 감사 ───────────────────────────────────────
  created_by       uuid,
  created_by_label text,
  created_at       timestamptz not null default now()
);

comment on table content_revisions is
  '콘텐츠 개정 원장. append-only. 3축(고지/콘텐츠/판본) 독립 상태 관리.';

create index if not exists idx_rev_target
  on content_revisions (content_type, content_id, created_at desc);
create index if not exists idx_rev_notice
  on content_revisions (notice_status, subject_code, created_at desc)
  where notice_status <> 'none';
create index if not exists idx_rev_merge
  on content_revisions (merge_status, source_edition_id)
  where merge_status = 'pending';
create index if not exists idx_rev_node
  on content_revisions (node_id) where node_id is not null;
create index if not exists idx_rev_scheduled
  on content_revisions (scheduled_for)
  where apply_status = 'scheduled';
create index if not exists idx_rev_created
  on content_revisions (created_at desc);

-- ────────────────────────────────────────────────────────────
-- 2. v1.2.1 §2 — 컬럼 3개 추가
-- ────────────────────────────────────────────────────────────
alter table content_revisions
  add column source_ref   jsonb,
  add column subject_ref  jsonb,
  add column app_name     text;

comment on column content_revisions.source_ref is
  '기록 원천. 예: {"table":"article_revisions","id":"…","change_kind":"…"} / {"table":"problem_choices","id":"…"}';
comment on column content_revisions.subject_ref is
  '과목 원본 참조. subject_code 정규화는 Phase 3에서 파생.';

create index idx_rev_app on content_revisions (app_name, created_at desc);

-- ────────────────────────────────────────────────────────────
-- 3. append-only 가드 (지시서 v1.1 §2.2 그대로)
-- ────────────────────────────────────────────────────────────
create or replace function trg_revision_append_only()
returns trigger language plpgsql as $$
begin
  if new.content_type    is distinct from old.content_type
  or new.content_id      is distinct from old.content_id
  or new.op              is distinct from old.op
  or new.before_snapshot is distinct from old.before_snapshot
  or new.after_snapshot  is distinct from old.after_snapshot
  or new.changed_fields  is distinct from old.changed_fields
  or new.created_at      is distinct from old.created_at then
    raise exception
      '개정 원장의 변경 실체는 불변입니다 (revision_id=%). 상태/서술 필드만 수정 가능합니다.',
      old.revision_id;
  end if;
  return new;
end $$;

drop trigger if exists revision_append_only on content_revisions;
create trigger revision_append_only
  before update on content_revisions
  for each row execute function trg_revision_append_only();

create or replace function trg_revision_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception '개정 원장은 삭제할 수 없습니다 (revision_id=%).', old.revision_id;
end $$;

drop trigger if exists revision_no_delete on content_revisions;
create trigger revision_no_delete
  before delete on content_revisions
  for each row execute function trg_revision_no_delete();

-- ────────────────────────────────────────────────────────────
-- 4. 억제 창 (v1.2.1 §3.1)
-- ────────────────────────────────────────────────────────────
create table revision_suppress_windows (
  window_id   uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  reason      text not null,
  scope       text[],
  created_by  uuid,
  closed_at   timestamptz,
  constraint chk_window_max_2h check (expires_at <= started_at + interval '2 hours'),
  constraint chk_window_order  check (expires_at > started_at)
);

create index idx_suppress_active on revision_suppress_windows (expires_at)
  where closed_at is null;

comment on table revision_suppress_windows is
  '대량 배치 중 개정 원장 기록을 일시 억제. 최대 2시간 자동 만료.';

-- [편차 D3] 억제 이력은 staff만 열람. 쓰기는 security definer 함수 경유만.
alter table revision_suppress_windows enable row level security;
create policy suppress_staff_select on revision_suppress_windows
  for select using ( private.is_staff(auth.uid()) );

create or replace function fn_revision_suppressed(p_content_type text)
returns boolean language sql stable as $$
  select coalesce(current_setting('lidam.skip_revision_log', true), 'off') = 'on'
      or exists (
           select 1 from revision_suppress_windows
            where closed_at is null
              and now() < expires_at
              and (scope is null or p_content_type = any(scope))
         );
$$;

create or replace function fn_open_suppress_window(
  p_reason text, p_minutes int default 30, p_scope text[] default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- [편차 D1] RPC 노출 대비 권한 가드 — 없으면 아무 로그인 사용자가 2시간 기록을 끌 수 있음.
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_staff(auth.uid())) then
    raise exception '억제 창은 staff 또는 service_role만 열 수 있습니다';
  end if;
  if p_minutes > 120 then
    raise exception '억제 창은 최대 120분입니다 (요청: %분)', p_minutes;
  end if;
  insert into revision_suppress_windows (expires_at, reason, scope, created_by)
  values (now() + make_interval(mins => p_minutes), p_reason, p_scope, auth.uid())
  returning window_id into v_id;
  return v_id;
end $$;

create or replace function fn_close_suppress_window(p_window_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- [편차 D1] fn_open 과 동일 가드 (문서는 sql 함수·무가드).
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_staff(auth.uid())) then
    raise exception '억제 창은 staff 또는 service_role만 닫을 수 있습니다';
  end if;
  update revision_suppress_windows set closed_at = now()
   where window_id = p_window_id and closed_at is null;
end $$;

-- ────────────────────────────────────────────────────────────
-- 5-1. 조문 전용 트리거 함수 (v1.2.1 §3.2)
--      치환: <node컬럼 or NULL> → null (article_revisions 에 node 컬럼 없음 — A2)
-- ────────────────────────────────────────────────────────────
create or replace function fn_log_revision_article()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prev    jsonb;
  v_after   jsonb := to_jsonb(new);
  v_changed text[];
  v_ignore  text[] := array['revision_id', 'created_at', 'created_by'];
  v_apply   text;
begin
  if fn_revision_suppressed('statute') then return null; end if;

  -- 직전 리비전 = before (시행 순서 기준 — v1.2.1 §1.6(2))
  select to_jsonb(r) into v_prev
    from article_revisions r
   where r.article_id = new.article_id
     and r.revision_id <> new.revision_id
     and (r.effective_date < new.effective_date
          or (r.effective_date = new.effective_date and r.created_at < new.created_at))
   order by r.effective_date desc, r.created_at desc
   limit 1;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_prev,'{}'::jsonb) || v_after) as k) t
   where (coalesce(v_prev,'{}'::jsonb) -> k) is distinct from (v_after -> k)
     and k <> all(v_ignore);

  -- ★ 시행일 기준 축B 자동 판정 (v1.2.1 §1.6(1))
  v_apply := case
    when new.effective_date is null then 'applied'
    when new.effective_date <= current_date then 'applied'
    else 'scheduled'
  end;

  insert into content_revisions (
    content_type, content_id, source_ref, node_id,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at, scheduled_for, effective_date,
    created_by, created_by_label, app_name
  ) values (
    'statute',
    new.article_id::text,
    jsonb_build_object(
      'table','article_revisions',
      'id', new.revision_id,
      'change_kind', v_after ->> 'change_kind',
      'expired_date', v_after ->> 'expired_date'),
    null,  -- 치환: article_revisions 에 node 컬럼 없음
    case when v_prev is null then 'INSERT' else 'UPDATE' end,
    v_prev, v_after, v_changed,
    v_apply,
    case when v_apply = 'applied' then now() end,
    case when v_apply = 'scheduled' then new.effective_date end,
    new.effective_date,
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  );
  return null;
end $$;

-- ────────────────────────────────────────────────────────────
-- 5-2. 문제 전용 트리거 함수 (v1.2.1 §3.3)
--      치환: problems_pk→problem_id · problems_node컬럼→primary_node_id
--            choices_pk→choice_id · 선지번호컬럼→choice_index
-- ────────────────────────────────────────────────────────────
create or replace function fn_problem_content_type(p_format text)
returns text language sql immutable as $$
  select case
    when p_format is null            then 'mcq'
    when p_format like 'mc%'         then 'mcq'
    when p_format like 'subjective%' then 'essay'
    when p_format like 'essay%'      then 'essay'
    else 'mcq'
  end;
$$;

create or replace function fn_log_revision_problem()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target   text := tg_argv[0];
  v_ignore   text[] := coalesce(string_to_array(tg_argv[1], ','), '{}');
  v_before   jsonb := case when tg_op='INSERT' then null else to_jsonb(old) end;
  v_after    jsonb := case when tg_op='DELETE' then null else to_jsonb(new) end;
  v_row      jsonb := coalesce(v_after, v_before);
  v_changed  text[];
  v_problem_id text;
  v_format   text;
  v_law_id   uuid;
  v_science  text;
  v_node     text;
  v_ctype    text;
  v_src      jsonb;
begin
  if v_target = 'problems' then
    v_problem_id := v_row ->> 'problem_id';
    v_format     := v_row ->> 'format';
    v_law_id     := nullif(v_row ->> 'law_id','')::uuid;
    v_science    := v_row ->> 'science_subject';
    v_node       := v_row ->> 'primary_node_id';
    v_src        := jsonb_build_object('table','problems','format', v_format);
  else
    v_problem_id := v_row ->> 'problem_id';
    select p.format, p.law_id, p.science_subject, p.primary_node_id
      into v_format, v_law_id, v_science, v_node
      from problems p where p.problem_id = v_problem_id::uuid;
    v_src := jsonb_build_object(
               'table','problem_choices',
               'id', v_row ->> 'choice_id',
               'choice_no', v_row ->> 'choice_index',
               'format', v_format);
  end if;

  v_ctype := fn_problem_content_type(v_format);
  if fn_revision_suppressed(v_ctype) then return null; end if;

  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_before,'{}'::jsonb) || coalesce(v_after,'{}'::jsonb)) as k) t
   where (coalesce(v_before,'{}'::jsonb) -> k) is distinct from (coalesce(v_after,'{}'::jsonb) -> k)
     and k <> all(v_ignore);

  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then return null; end if;

  insert into content_revisions (
    content_type, content_id, source_ref, subject_ref, node_id,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at,
    created_by, created_by_label, app_name
  ) values (
    v_ctype,
    v_problem_id,
    v_src,
    -- [편차 D4] 자과 문제는 law_id 가 null — science_subject 를 함께 보존해야 원본 참조가 성립.
    jsonb_build_object('law_id', v_law_id, 'science_subject', v_science),
    v_node,
    tg_op, v_before, v_after, v_changed,
    'applied', now(),
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  );
  return null;
end $$;

-- ────────────────────────────────────────────────────────────
-- 5-3. 범용 트리거 함수 (지시서 v1.1 §2.3 + v1.2.1 §3.4 수정 3곳)
-- ────────────────────────────────────────────────────────────
create or replace function fn_log_content_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_content_type text := tg_argv[0];   -- 'precedent' 등
  v_pk_col       text := tg_argv[1];   -- PK 컬럼명
  v_node_col     text := tg_argv[2];   -- node 컬럼명 ('' 이면 없음)
  v_subject_col  text := tg_argv[3];   -- 과목 컬럼명 ('' 이면 없음)
  v_ignore       text[] := coalesce(string_to_array(tg_argv[4], ','), '{}');

  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_changed text[];
begin
  -- (수정 1) 억제 판정: GUC + 억제 창
  if fn_revision_suppressed(v_content_type) then return null; end if;

  v_before := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after  := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row    := coalesce(v_after, v_before);

  -- 변경 필드 산출 (노이즈 컬럼 제외)
  select coalesce(array_agg(k order by k), '{}') into v_changed
    from (select jsonb_object_keys(coalesce(v_before,'{}'::jsonb) || coalesce(v_after,'{}'::jsonb)) as k) t
   where (coalesce(v_before,'{}'::jsonb) -> k) is distinct from (coalesce(v_after,'{}'::jsonb) -> k)
     and k <> all(v_ignore);

  -- 노이즈 컬럼만 변경된 UPDATE는 기록하지 않음
  if tg_op = 'UPDATE' and cardinality(v_changed) = 0 then
    return null;
  end if;

  insert into content_revisions (
    content_type, content_id, node_id, subject_ref,
    op, before_snapshot, after_snapshot, changed_fields,
    apply_status, applied_at,
    created_by, created_by_label, app_name
  ) values (
    v_content_type,
    v_row ->> v_pk_col,
    case when v_node_col <> '' then v_row ->> v_node_col else null end,
    -- (수정 2) 과목은 정규화하지 않고 원본 참조 보존 (uuid FK/배열 그대로)
    case when v_subject_col <> ''
         then jsonb_build_object(v_subject_col, v_row -> v_subject_col)
         else null end,
    tg_op, v_before, v_after, v_changed,
    'applied', now(),
    auth.uid(),
    case when auth.uid() is null then 'system' else null end,
    -- (수정 3) 기록 주체 식별
    current_setting('application_name', true)
  );

  return null;  -- AFTER 트리거
end $$;

-- ────────────────────────────────────────────────────────────
-- 6. 트리거 설치 (v1.2.1 §4 — 순서가 우선순위)
-- ────────────────────────────────────────────────────────────

-- ① 정답 정정 [최우선] — 현재 무흔적 상태 해소. 제외컬럼: 없음 (A6 — updated_at 자체가 없음)
create trigger log_revision_problem_choices
  after insert or update or delete on problem_choices
  for each row execute function fn_log_revision_problem('problem_choices', '');

-- ② 문제 본체. 제외컬럼: updated_at (A6 — problems 에 search_tsv·통계 캐시 없음)
create trigger log_revision_problems
  after insert or update or delete on problems
  for each row execute function fn_log_revision_problem('problems', 'updated_at');

-- ③ 조문 본문 (INSERT 전용 — 스냅샷 불변)
create trigger log_revision_article
  after insert on article_revisions
  for each row execute function fn_log_revision_article();

-- ④ 판례. 제외컬럼: A6 실측 6종
create trigger log_revision_cases
  after insert or update or delete on cases
  for each row execute function fn_log_content_revision(
    'precedent', 'case_id', 'primary_node_id', 'subject_laws',
    'updated_at,search_tsv,official_text_checked_at,official_text_check_count,official_text_unavailable,pending_primary_node_id'
  );

-- articles 본체 트리거는 v1.2.1 §1.1 에 따라 Phase 1 에서 설치하지 않음.

-- ────────────────────────────────────────────────────────────
-- 7. RLS (지시서 v1.1 §2.5 — 판별은 private.is_staff, v1.2.1 규칙 11)
-- ────────────────────────────────────────────────────────────
alter table content_revisions enable row level security;

create policy revision_admin_select on content_revisions
  for select using ( private.is_staff(auth.uid()) );

create policy revision_admin_update on content_revisions
  for update using ( private.is_staff(auth.uid()) );

-- INSERT 는 security definer 트리거만 수행. 정책 부여 없음.
-- 수험생 조회 정책은 Phase 4 에서 notice_status='published' 한정으로 추가.

-- ────────────────────────────────────────────────────────────
-- 8. 운영 확인용 뷰 (지시서 v1.1 §2.6)
--    [편차 D2] security_invoker = on — owner 권한 뷰가 RLS 를 우회해
--    PostgREST 로 원장이 전체 공개되는 것을 방지.
-- ────────────────────────────────────────────────────────────
create or replace view v_revision_recent
  with (security_invoker = on) as
select revision_id, content_type, content_id, node_id, subject_code,
       op, changed_fields,
       notice_status, apply_status, merge_status,
       created_by_label, created_at
  from content_revisions
 order by created_at desc;

create or replace view v_revision_merge_pending
  with (security_invoker = on) as
select content_type, subject_code, count(*) as cnt,
       min(created_at) as oldest, max(created_at) as latest
  from content_revisions
 where merge_status = 'pending'
 group by content_type, subject_code
 order by cnt desc;

commit;
