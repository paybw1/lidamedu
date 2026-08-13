-- ============================================================
-- errata Phase 3 — 발행 액션 (축A 상태 전이)
-- 근거: 지시서 Phase 3 §5 + §10 (source_discrepancy 처리)
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260815_phase3_publish_errata.sql
-- 롤백: scripts/sql/20260815_phase3_publish_errata_rollback.sql
-- ============================================================
begin;

-- ── 1. 철회 지원 컬럼 (§5.2 — Phase 1 테이블에 없던 설계서 v1.1 §3.1 컬럼 보강) ──
alter table content_revisions
  add column withdrawn_at          timestamptz,
  add column withdraws_revision_id uuid references content_revisions(revision_id);

comment on column content_revisions.withdraws_revision_id is
  '철회 고지 행 → 철회 대상 revision. 오발행은 지우지 않고 철회 사실을 새 행으로 남긴다.';

-- ── 2. §10 — 교재 오기 기록 (source_discrepancy) ──
alter table publication_content_map
  add column source_discrepancy jsonb;

comment on column publication_content_map.source_discrepancy is
  '교재 인쇄본과 실제 콘텐츠의 불일치 기록(교재 오기 등). 매핑 자체는 실제 콘텐츠 기준.';

update publication_content_map m
set source_discrepancy = v.d
from (values
  ('a061f939-6004-407a-bdb9-d66f06ba4981',
   '{"kind":"case_number_typo","printed":"2017다245789","actual":"2017다245798","note":"법령정보센터 확인 — 245789 부존재","found_at":"2026-08-13"}'::jsonb),
  ('c160ffc8-2b68-426d-9fc3-ac4ba3632aba',
   '{"kind":"case_number_typo","printed":"2009. 10. 16.(사건번호 자리에 선고일 중복 인쇄)","actual":"2009허351","note":"마법천자문 사건 — 본문 대조 확정","found_at":"2026-08-13"}'::jsonb)
) as v(content_id, d)
where m.content_type = 'precedent' and m.content_id = v.content_id;

do $$
declare n int;
begin
  select count(*) into n from publication_content_map where source_discrepancy is not null;
  if n <> 2 then raise exception 'source_discrepancy 백필 %/2', n; end if;
end $$;

-- ── 3. 발행 게이트 — 원장·관리자 전용 (§2: 강사 제외. 실제 롤 = manager/admin) ──
create or replace function private.is_publisher(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where profile_id = p_user_id and role::text = any (array['manager','admin'])
  );
$$;

-- ── 4. 발행 (§5.1) — 축A 전이. 변경 실체는 건드리지 않아 append-only 가드 무접촉 ──
create or replace function fn_publish_errata(
  p_revision_ids uuid[],
  p_errata_kind text,
  p_errata_severity text,
  p_errata_title text,
  p_errata_payload jsonb,
  p_errata_reason text,
  p_source_edition_id uuid default null
) returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  -- 이중 가드: 서버 액션(getStaffRole)과 별개로 DB 에서도 발행 롤을 강제.
  -- service_role(운영 스크립트)은 허용.
  if not (coalesce(auth.role(), '') = 'service_role' or private.is_publisher(auth.uid())) then
    raise exception '발행 권한이 없습니다 (원장·관리자 전용)';
  end if;

  return query
  update content_revisions
     set notice_status   = 'published',
         published_at    = now(),
         errata_kind     = p_errata_kind,
         errata_severity = p_errata_severity,
         errata_title    = p_errata_title,
         errata_payload  = p_errata_payload,
         errata_reason   = p_errata_reason,
         source_edition_id = coalesce(p_source_edition_id, source_edition_id)
   where revision_id = any(p_revision_ids)
     and notice_status = 'none'
  returning revision_id;
end $$;

comment on function fn_publish_errata is
  '추록·정오표 발행 — notice_status none→published. 발행=즉시 게시(대기함 없음).';

-- ── 5. 철회 (§5.2) — 대상은 withdrawn 전이 + 철회 사실을 새 행으로 기록 ──
create or replace function fn_withdraw_errata(
  p_revision_id uuid,
  p_reason text
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

  -- 대상: 축A withdrawn (상태 필드만 — append-only 가드 무접촉)
  update content_revisions
     set notice_status = 'withdrawn', withdrawn_at = now()
   where revision_id = p_revision_id;

  -- 철회 고지 행 — 변경 실체 없는 메타 행(스냅샷 null). 수험생 화면 표시는 Phase 4.
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
  '오발행 철회 — 대상 withdrawn 전이 + 철회 고지 행 신설(조용한 삭제 금지).';

commit;
