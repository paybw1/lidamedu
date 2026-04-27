create or replace function update_provisional_application(
  p_patent_id uuid,
  p_user_id uuid,
  p_title_en text,
  p_applicant jsonb,
  p_inventor jsonb,
  p_attached_files jsonb,
  p_client_request text,
  p_is_urgent boolean
)
returns table(
  patent_id uuid,
  our_ref text,
  process_id uuid
) as $$
declare
  updated_our_ref text;
  new_process_id uuid;
begin
  -- 1️⃣ 특허 테이블 업데이트
  update patents
  set
    title_en = p_title_en,
    applicant = p_applicant,
    inventor = p_inventor,
    metadata = jsonb_build_object('attached_files', p_attached_files),
    status = 'awaiting_payment',
    updated_at = now()
  where id = p_patent_id and user_id = p_user_id
  returning patents.our_ref into updated_our_ref;

  -- 2️⃣ 프로세스 기록 추가 후 id 반환
  insert into processes_patents (
    user_id,
    case_id,
    our_ref,
    step_name,
    status,
    attached_files,
    client_request,
    is_urgent
  )
  values (
    p_user_id,
    p_patent_id,
    updated_our_ref,
    'provisional application filling',
    'awaiting_payment',
    p_attached_files,
    p_client_request,
    p_is_urgent
  )
  returning id into new_process_id;

  -- 3️⃣ 최종 반환
  return query select p_patent_id, updated_our_ref, new_process_id;
end;
$$ language plpgsql;
