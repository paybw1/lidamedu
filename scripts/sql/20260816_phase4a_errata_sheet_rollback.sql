-- Phase 4a 롤백 — 뷰·컬럼·정책·p_notify 원복 (버킷·업로드 파일은 보존)
begin;
drop view if exists v_errata_sheet;
drop policy if exists pcm_student_select on publication_content_map;
drop policy if exists edition_student_select on publication_editions;
drop policy if exists publication_student_select on publications;
alter table publication_editions
  drop column if exists errata_sheet_url,
  drop column if exists errata_sheet_updated_at,
  drop column if exists errata_sheet_item_count;
-- p_notify 3-인자 → Phase 3 의 2-인자 버전 복원
drop function if exists fn_withdraw_errata(uuid, text, boolean);
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
  update content_revisions
     set notice_status = 'withdrawn', withdrawn_at = now()
   where revision_id = p_revision_id;
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
commit;
