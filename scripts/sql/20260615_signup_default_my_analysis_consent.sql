-- feat-8-026b 5-iii — 가입 시 A(내 학습 분석) 기본 ON.
-- handle_new_user 트리거가 profiles INSERT 시 my_analysis_consent_at = now() 를 채운다.
-- B(pool_consent_at)는 미설정(NULL = opt-in) 유지 — 제3자적 활용은 명시 동의로만.
-- 라이브 트리거가 signup_setup.sql 와 동일함을 pg_get_functiondef 로 확인 후 작성(2026-06-15).
-- 적용: node scripts/jagwa/mgmt-sql.mjs scripts/sql/20260615_signup_default_my_analysis_consent.sql
-- 기존 프로필(테스트 38명)은 미적용 — 미래 가입에만 반영. 롤백 = _rollback 파일.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (profile_id, name, marketing_consent, my_analysis_consent_at)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(new.email, '@', 1)
    ),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false),
    now()
  );
  return new;
end;
$function$;
