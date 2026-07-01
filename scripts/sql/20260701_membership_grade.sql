-- feat-8-027 회원 등급 — Stage 1 스키마 + 리졸버 토대.
-- 등급: 체험(가입 후 15일, 특허법 자기학습) → 무료회원(자동, 커뮤니티+학습정보)
--       → 자기학습(과목별 결제) → 종합반(운영자 확인, 종류별 범위).

-- 1) 체험 추적: 가입 후 15일. trial_ends_at + 만료 공지 1회 플래그.
alter table public.profiles
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_expiry_notified_at timestamptz;

-- 기존 사용자 backfill: created_at + 15일 (대부분 이미 만료 → 무료회원으로 수렴).
update public.profiles
  set trial_ends_at = created_at + interval '15 days'
  where trial_ends_at is null;

-- 2) 자기학습 과목별 활성화: 구독 row 에 과목 코드. null = 전체(레거시/whole).
alter table public.user_subscriptions
  add column if not exists subject_code text;

-- 3) 종합반 종류별 열람 범위: full(전체) | self_study(자기학습 수준으로 제한).
alter table public.cohorts
  add column if not exists access_scope text not null default 'full';
alter table public.cohorts
  drop constraint if exists cohorts_access_scope_check;
alter table public.cohorts
  add constraint cohorts_access_scope_check
    check (access_scope in ('full', 'self_study'));

-- 4) 자기학습 플랜(pro_monthly) 기능 보강 — 학습관리·합격자비교 포함,
--    상담(one_on_one_consult)·과제(cohort_curriculum)·모의고사(area_mock_exams)·
--    반별 게시판은 제외(종합반 전용).
update public.subscription_plans
  set name = '자기학습',
      features = '["area_subjects","area_study_aids","area_study_mgmt","passer_benchmarks","passer_trend","passer_summaries","weak_node_guide","recommended_actions","base_learning"]'::jsonb
  where code = 'pro_monthly';

-- 5) handle_new_user: 신규 가입 시 체험 만료일(now + 15일) 세팅. (기존 로직 보존 + trial_ends_at 추가)
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
  v_name := coalesce(
    nullif(meta ->> 'name', ''),
    nullif(meta ->> 'full_name', ''),
    nullif(meta ->> 'display_name', ''),
    nullif(meta ->> 'user_name', ''),
    split_part(new.email, '@', 1)
  );
  v_nickname := coalesce(
    nullif(meta ->> 'nickname', ''),
    nullif(meta ->> 'user_name', ''),
    nullif(meta ->> 'preferred_username', ''),
    nullif(meta ->> 'name', '')
  );
  v_avatar := coalesce(
    nullif(meta ->> 'avatar_url', ''),
    nullif(meta ->> 'picture', '')
  );
  v_phone := coalesce(
    nullif(meta ->> 'phone', ''),
    nullif(meta ->> 'phone_number', ''),
    nullif(new.phone, '')
  );
  if v_phone is not null then
    v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');
    v_phone := nullif(v_phone, '');
  end if;
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
    my_analysis_consent_at,
    trial_ends_at
  )
  values (
    new.id,
    v_name,
    v_nickname,
    v_avatar,
    v_phone,
    v_address,
    coalesce((meta ->> 'marketing_consent')::boolean, false),
    now(),
    now() + interval '15 days'
  )
  on conflict (profile_id) do nothing;

  return new;
end;
$function$;
