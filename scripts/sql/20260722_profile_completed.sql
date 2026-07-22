-- feat-8-030 — 가입 후 필수정보(회원명·휴대전화·주소) 입력 게이트.
-- 카카오 OAuth 는 이름을 일부만 주고(없으면 이메일 앞부분으로 대체) 전화번호·주소는 사실상
-- 제공하지 않으므로, 신규 가입자에게 인앱 필수정보 폼을 강제한다. profile_completed_at 이
-- NULL 인 학생을 /onboarding/profile 로 보낸다(staff 면제).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

-- ★기존 회원은 즉시 면제(대량 강제 게이트 방지). 소급 수집(전화·주소)은 별도 결정 후 진행.
--   신규 가입자는 트리거가 이 컬럼을 채우지 않으므로 NULL → 게이트 대상.
UPDATE public.profiles
  SET profile_completed_at = now()
  WHERE profile_completed_at IS NULL;
