-- 롤백 — 계산 기준일 제거
alter table public.refunds drop column if exists calc_basis_on;
