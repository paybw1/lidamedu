-- 공지·가이드에 쓸 enum 값과 기존 데이터 관례.
select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as vals
  from pg_type t join pg_enum e on e.enumtypid = t.oid
 where t.typname in ('announcement_audience_kind','announcement_platform_scope','announcement_audience_target')
 group by t.typname;
