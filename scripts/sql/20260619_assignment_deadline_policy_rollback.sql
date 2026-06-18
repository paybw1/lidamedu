-- 롤백 — feat-7-021b ④ 마감 정책. 컬럼·enum 제거(추가형의 역). 기존 동작(마감 무관 완료 인정)으로 환원.
alter table public.assignments drop column if exists deadline_policy;
drop type if exists public.deadline_policy;
