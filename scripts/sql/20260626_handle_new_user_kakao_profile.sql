-- handle_new_user 보강: 카카오 동의항목(닉네임·프로필 사진·이름·전화번호·주소)을
-- 가입 시점에 profiles 로 미러링한다. 기존엔 name 만 기록했다.
--   · 닉네임/프로필 사진: 현재 3-scope 에서도 즉시 채워진다.
--   · 전화번호/주소: 카카오 6항목(name·phone_number·shipping_address) 동의가
--     실제로 부여될 때만 메타데이터에 실리므로, 그 전까지는 NULL 로 남는다(무해).
-- 모든 대상 컬럼은 nullable — 값이 없으면 건너뛴다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_name text;
  v_nickname text;
  v_avatar text;
  v_phone text;
  v_address text;
begin
  -- 이름(실명) — name/full_name/display_name, 없으면 이메일 아이디로 폴백.
  v_name := coalesce(
    nullif(meta ->> 'name', ''),
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'display_name', ''),
    nullif(meta ->> 'user_name', ''),
    split_part(new.email, '@', 1)
  );

  -- 닉네임 — 카카오 profile_nickname (GoTrue 가 user_name/preferred_username/name 으로 매핑).
  v_nickname := coalesce(
    nullif(meta ->> 'nickname', ''),
    nullif(meta ->> 'user_name', ''),
    nullif(meta ->> 'preferred_username', ''),
    nullif(meta ->> 'name', '')
  );

  -- 프로필 사진.
  v_avatar := coalesce(
    nullif(meta ->> 'avatar_url', ''),
    nullif(meta ->> 'picture', '')
  );

  -- 전화번호 — 카카오 phone_number (있을 때). 공백/하이픈 제거해 E.164 근사로 저장.
  v_phone := coalesce(
    nullif(meta ->> 'phone', ''),
    nullif(meta ->> 'phone_number', ''),
    nullif(new.phone, '')
  );
  if v_phone is not null then
    v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');
    v_phone := nullif(v_phone, '');
  end if;

  -- 주소 — 카카오 배송지(shipping_address, 있을 때).
  v_address := coalesce(
    nullif(meta ->> 'address', ''),
    nullif(meta ->> 'shipping_address', '')
  );

  insert into public.profiles (
    profile_id,
    name,
    nickname,
    avatar_url,
    phone_e164,
    address,
    marketing_consent,
    my_analysis_consent_at
  )
  values (
    new.id,
    v_name,
    v_nickname,
    v_avatar,
    v_phone,
    v_address,
    coalesce((meta ->> 'marketing_consent')::boolean, false),
    now()
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$function$;
