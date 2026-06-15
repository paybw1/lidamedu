-- 롤백 — handle_new_user 를 my_analysis_consent_at 미설정(원본) 으로 원복.
-- 컬럼 자체는 제거하지 않는다(다른 곳에서 사용). 함수 정의만 원복.
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260615_signup_default_my_analysis_consent_rollback.sql

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (profile_id, name, marketing_consent)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false)
  );
  return new;
end;
$function$;
