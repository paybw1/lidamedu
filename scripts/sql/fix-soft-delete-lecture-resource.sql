-- 관련자료(lecture_resources) soft-delete 가 RLS 로 막히는 버그 fix.
-- SELECT 정책이 deleted_at IS NULL 을 요구해, deleted_at 을 NOT NULL 로 세팅하는
-- UPDATE 의 새 행이 RLS 를 통과하지 못해 42501 로 실패한다(soft-delete 불가).
-- → SECURITY DEFINER RPC 로 staff 체크 후 definer 권한으로 UPDATE(RLS 우회).
create or replace function public.soft_delete_lecture_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if not private.is_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.lecture_resources
     set deleted_at = now()
   where resource_id = p_resource_id
     and deleted_at is null;
end;
$function$;

revoke all on function public.soft_delete_lecture_resource(uuid) from public;
grant execute on function public.soft_delete_lecture_resource(uuid) to authenticated, service_role;
