-- admin_audit_anomalies 잠재 버그 fix.
-- 본문의 max(al.log_id) 는 uuid 인데 Postgres 엔 max(uuid) 집계가 없어 호출 시
-- 42883 으로 항상 실패했다(이상신호 패널이 한 번도 작동 안 함 → /admin/audit-logs 크래시).
-- sample_log_id 는 그룹 내 "대표 1건"이면 충분하므로 텍스트로 max 후 uuid 캐스팅.
CREATE OR REPLACE FUNCTION public.admin_audit_anomalies(p_hours integer DEFAULT 24)
 RETURNS TABLE(anomaly_type text, severity text, bucket_start timestamp with time zone, actor_id uuid, actor_name text, entity_type text, event_count bigint, sample_log_id uuid, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_since timestamptz;
begin
  if not private.is_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  v_since := now() - (greatest(p_hours, 1) || ' hours')::interval;

  return query
  with bulk_delete as (
    select
      'bulk_delete'::text as anomaly_type,
      case when count(*) >= 50 then 'high'
           when count(*) >= 20 then 'medium'
           else 'low' end as severity,
      date_trunc('hour', al.created_at) as bucket_start,
      al.actor_id,
      max(p.name) as actor_name,
      al.entity_type,
      count(*)::bigint as event_count,
      max(al.log_id::text)::uuid as sample_log_id,
      jsonb_build_object(
        'window', '1h',
        'entity_type', al.entity_type
      ) as detail
    from audit_logs al
    left join profiles p on p.profile_id = al.actor_id
    where al.created_at >= v_since
      and al.action ilike '%delete%'
    group by date_trunc('hour', al.created_at), al.actor_id, al.entity_type
    having count(*) >= 10
  ),
  role_changes as (
    select
      'role_change'::text as anomaly_type,
      'high'::text as severity,
      al.created_at as bucket_start,
      al.actor_id,
      p.name as actor_name,
      al.entity_type,
      1::bigint as event_count,
      al.log_id as sample_log_id,
      coalesce(al.metadata, '{}'::jsonb)
        || jsonb_build_object('subject_profile_id', al.entity_id) as detail
    from audit_logs al
    left join profiles p on p.profile_id = al.actor_id
    where al.created_at >= v_since
      and al.action = 'user.role.update'
  )
  select * from bulk_delete
  union all
  select * from role_changes
  order by bucket_start desc, event_count desc;
end;
$function$;
