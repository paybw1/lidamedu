-- 할인: '가입(적용) 기간'(starts_at~ends_at)과 '혜택 지속 종료일'(renewal_until) 분리.
--   starts_at~ends_at = 이 기간에 구독을 시작해야 할인 자격(가입 창).
--   renewal_until     = 자격을 얻고 구독을 지속하는 동안 갱신에도 할인이 유지되는 마지막 시점.
-- 예: 7/1~8/31 가입자에게 2027-02-28(시험일 2027-2-27 포함 월 말)까지 갱신 할인 유지.

alter table public.discounts
  add column if not exists renewal_until timestamptz;

comment on column public.discounts.renewal_until is
  '혜택 지속 종료일 — 가입 창(starts_at~ends_at)에 시작해 지속 중인 구독이 갱신에도 할인을 받는 마지막 시점. null=지속 없음(가입 창까지만).';
