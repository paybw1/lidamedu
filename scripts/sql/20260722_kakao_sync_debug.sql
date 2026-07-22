-- 임시 진단 테이블 — 카카오 자동수집(syncKakaoProfileFromToken) 실행 경로 추적.
-- provider_token 존재/HTTP 상태/필드 존재여부(불리언)만 기록(PII 값 미저장). 확인 후 DROP.
create table if not exists public.kakao_sync_debug (
  id bigint generated always as identity primary key,
  user_id uuid,
  at timestamptz default now(),
  provider_token_present boolean,
  http_status int,
  has_kakao_account boolean,
  has_name boolean,
  has_phone boolean,
  has_shipping boolean,
  shipping_count int,
  note text
);
alter table public.kakao_sync_debug enable row level security;
-- 정책 없음 = 익명/일반 접근 차단. service_role(adminClient)만 RLS 우회로 R/W.
