-- feat-8-027 후속 — 기존 가입 수험생 1회 체험 재부여 마커.
-- 백필로 trial_ends_at=created_at+15d 를 받아 이미 만료된 기존 학생들이 재접속 시
-- 15일 무료 체험을 1회 다시 받도록. trial_regranted_at 이 null 인 free_member 만 대상.
alter table public.profiles
  add column if not exists trial_regranted_at timestamptz;
