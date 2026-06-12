-- feat-8-026 학습 데이터 활용 필수 동의.
-- 학습 데이터 처리는 본 서비스(데이터 기반 진단·컨설팅)의 본질적 구성요소이므로
-- PIPA 제15조①4호(계약 이행에 필요한 처리)에 근거하며 이용약관에 편입한다.
-- NULL = 미동의 → 학생은 서비스 이용 불가(게이트). staff 는 게이트 면제.
-- 기존 (선택) analytics_consent_at 과 별개 — 그 로직은 변경하지 않는다.

alter table public.profiles
  add column if not exists service_data_consent_at timestamptz;

comment on column public.profiles.service_data_consent_at is
  '학습 데이터 활용(서비스 제공·진단·분석) 필수 동의 시점. NULL=미동의 → 학생 서비스 이용 차단(게이트). PIPA 15(1)4 계약 이행 근거, 이용약관 편입. feat-8-026.';
