-- ============================================================
-- errata Phase 4a — PDF 게시 인프라 (뷰·컬럼·RLS·p_notify·Storage 버킷)
-- 근거: 지시서 Phase 4a §3.2·§3.4·§3.5·§5·§6
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260816_phase4a_errata_sheet.sql
-- 롤백: scripts/sql/20260816_phase4a_errata_sheet_rollback.sql
-- ============================================================
begin;

-- ── 1. 시트 데이터 뷰 (§3.2 — security_invoker 필수) ──
create or replace view v_errata_sheet
with (security_invoker = on) as
select r.revision_id,
       r.content_type, r.content_id,
       r.errata_kind, r.errata_severity, r.errata_title,
       r.errata_payload, r.errata_reason,
       r.effective_date, r.published_at, r.withdrawn_at,
       r.notice_status, r.withdraws_revision_id,
       m.edition_id, m.page_no, m.page_no_end, m.line_hint,
       m.toc_path, m.sort_key,
       e.edition_label, e.target_exam_date,
       p.title as publication_title,
       case
         when e.target_exam_date is null then 'unknown'
         when r.effective_date is null then 'applicable'
         when r.effective_date <= e.target_exam_date then 'applicable'
         else 'future'
       end as exam_scope
  from content_revisions r
  join publication_content_map m
    on m.content_type = r.content_type and m.content_id = r.content_id
  join publication_editions e on e.edition_id = m.edition_id
  join publications p on p.publication_id = e.publication_id
 where r.notice_status in ('published','withdrawn');

comment on view v_errata_sheet is
  '추록·정오표 시트 원천(교재 단위 — 매핑 없는 콘텐츠 제외). PDF 렌더는 서버에서만 조회.';

-- ── 2. 시트 캐시 컬럼 (§3.4 — 목록 화면은 이 3개만 읽는다) ──
alter table publication_editions
  add column errata_sheet_url        text,
  add column errata_sheet_updated_at timestamptz,
  add column errata_sheet_item_count int not null default 0;

-- ── 3. 수험생 RLS (§5 — 최소) ──
-- [검토 D1] revision_student_select: 지시서 명세 그대로. 단, 이 정책은 PostgREST
--   직접 조회로 published 행의 before/after_snapshot(행 전체 스냅샷)까지 열게 된다
--   — RLS 는 행 단위라 컬럼을 못 가린다. 4a 의 수험생 경로(목록=editions 3컬럼,
--   PDF=서버 렌더)에는 이 정책이 필요 없어, 승인 판단을 위해 보고서에 명시한다.
create policy revision_student_select on content_revisions
  for select using (notice_status in ('published','withdrawn'));

create policy pcm_student_select on publication_content_map
  for select using (true);

create policy edition_student_select on publication_editions
  for select using (status in ('frozen','printed','superseded'));

create policy publication_student_select on publications
  for select using (deleted_at is null);

-- ── 4. fn_withdraw_errata — p_notify 추가 (§6) ──
-- ★기존 2-인자 시그니처는 DROP (남기면 2-인자 호출이 모호해진다).
drop function if exists fn_withdraw_errata(uuid, text);

create or replace function fn_withdraw_errata(
  p_revision_id uuid,
  p_reason text,
  p_notify boolean default true
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_target content_revisions%rowtype;
  v_new_id uuid;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_publisher(auth.uid())) then
    raise exception '철회 권한이 없습니다 (원장·관리자 전용)';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception '철회 사유는 필수입니다';
  end if;

  select * into v_target from content_revisions where revision_id = p_revision_id;
  if not found then raise exception '대상 revision 없음: %', p_revision_id; end if;
  if v_target.notice_status <> 'published' then
    raise exception '발행 상태가 아닌 revision 은 철회할 수 없습니다 (현재: %)', v_target.notice_status;
  end if;

  update content_revisions
     set notice_status = 'withdrawn', withdrawn_at = now()
   where revision_id = p_revision_id;

  -- p_notify=false: 고지 행 생략 (테스트·정리용). 실개정 오발행은 기본 true 유지.
  if not p_notify then
    return null;
  end if;

  insert into content_revisions (
    content_type, content_id, node_id, subject_code, subject_ref,
    op, before_snapshot, after_snapshot, changed_fields,
    notice_status, errata_kind, errata_severity,
    errata_title, errata_reason, published_at,
    apply_status, applied_at, merge_status,
    source_edition_id, withdraws_revision_id,
    source_ref, created_by, created_by_label, app_name
  ) values (
    v_target.content_type, v_target.content_id, v_target.node_id,
    v_target.subject_code, v_target.subject_ref,
    'UPDATE', null, null, '{}',
    'published', v_target.errata_kind, v_target.errata_severity,
    '[철회] ' || coalesce(v_target.errata_title, v_target.content_type || ' ' || v_target.content_id),
    p_reason, now(),
    'skipped', null, 'excluded',
    v_target.source_edition_id, p_revision_id,
    jsonb_build_object('origin', 'withdrawal', 'withdraws', p_revision_id),
    auth.uid(),
    case when auth.uid() is null then 'system' end,
    current_setting('application_name', true)
  ) returning revision_id into v_new_id;

  return v_new_id;
end $$;

comment on function fn_withdraw_errata is
  '오발행 철회 — withdrawn 전이. p_notify=true 면 철회 고지 행 신설(기본), false 면 생략(정리용).';

-- ── 5. Storage 공개 버킷 (§3.5 — 고정 URL errata/{edition_id}.pdf) ──
insert into storage.buckets (id, name, public)
values ('errata', 'errata', true)
on conflict (id) do nothing;

commit;
