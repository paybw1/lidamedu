create or replace function create_provisional_application(
  p_user_id uuid,
  p_title_en text,
  p_applicant jsonb,
  p_inventor jsonb,
  p_attached_files jsonb,
  p_client_request text,
  p_is_urgent boolean
)
returns table(patent_id uuid, our_ref text) as $$
declare
  new_patent_id uuid;
  new_our_ref text;
begin
  -- 1. 특허 테이블에 삽입
  insert into patents (
    user_id,
    application_type,
    status,
    title_en,
    applicant,
    inventor,
    metadata
  )
  values (
    p_user_id,
    'provisional',
    'awaiting_payment',
    p_title_en,
    p_applicant,
    p_inventor,
    jsonb_build_object('attached_files', p_attached_files)
  )
  returning id, patents.our_ref into new_patent_id, new_our_ref;

  -- 2. 프로세스 테이블에 삽입 (추가된 client_request, is_urgent 포함)
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
    new_patent_id,
    new_our_ref,
    'provisional application filling',
    'awaiting_payment',
    p_attached_files,
    p_client_request,
    p_is_urgent
  );

  return query select new_patent_id, new_our_ref;
end;
$$ language plpgsql;
