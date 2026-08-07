-- feat-11-008 P1 — 쿠폰 개별 발급 이력에 발급 사유/관리자 메모 저장 (260807 요청서).
alter table public.coupon_grants add column if not exists note text;
comment on column public.coupon_grants.note is '발급 사유 또는 관리자 메모 (feat-11-008)';
