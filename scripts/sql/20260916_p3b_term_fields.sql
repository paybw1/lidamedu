-- feat-11-013 P3-b — 정규 유형(online_term·package_term)의 「칸 없는 요청 항목」 3종.
-- ★적용 금지(설계 단계). 원장 승인 = 하드스톱 → scripts/run-prod-sql.mjs → npm run db:typegen.
--   소비 코드(computeExpiry·cart-resolve·카탈로그 숨김)는 이 DDL 이 운영에 적용된 뒤에 작성한다 —
--   먼저 배포되면 없는 컬럼을 select 해 런타임에서 깨진다.
--
-- 전부 NULL 허용·기본 NULL = 현행 동작 그대로(중간 신청 = until_end, 판매 종료일 없음).
-- 롤백: scripts/sql/20260916_p3b_term_fields_rollback.sql
begin;

-- ① 수강 시작일 — 정규 과정의 「수강 시작일」(요청서 ② 온라인 정규 / ⑤ 정규 패키지 「패키지 시작일」).
--    NULL = 지급 즉시 시작(현행). 소비: computeExpiry 가 starts_on 이 미래면 starts_at = starts_on.
alter table plan_policies add column if not exists starts_on date;

-- ② 중간 신청 정책 — 「중간 신청 허용 여부」+「중간 신청자의 종료일 적용 방식」(요청서 ② 운영 예시).
--    until_end  = 기존 과정 종료일까지(현행 동작 = NULL 과 같다)
--    fixed_days = 신청일부터 mid_entry_days 일(상한 없음 — fixed_end_date 를 넘어도 그대로, 의도)
--    closed     = 중간 신청 불허(starts_on 경과 후 cart-resolve 거절)
alter table plan_policies add column if not exists mid_entry_mode text;
alter table plan_policies add column if not exists mid_entry_days int;
alter table plan_policies drop constraint if exists plan_policies_mid_entry_mode_check;
alter table plan_policies add constraint plan_policies_mid_entry_mode_check
  check (mid_entry_mode is null or mid_entry_mode in ('until_end', 'fixed_days', 'closed'));
alter table plan_policies drop constraint if exists plan_policies_mid_entry_days_check;
alter table plan_policies add constraint plan_policies_mid_entry_days_check
  check (mid_entry_days is null or mid_entry_days > 0);
-- fixed_days 면 일수가 반드시 있어야 한다 — 빈 값이면 계산할 수 없어 until_end 로 조용히 떨어진다.
alter table plan_policies drop constraint if exists plan_policies_mid_entry_days_required_check;
alter table plan_policies add constraint plan_policies_mid_entry_days_required_check
  check (mid_entry_mode is distinct from 'fixed_days' or mid_entry_days is not null);

-- ③ 판매 종료일 — available_from(오픈일)의 짝(요청서 ② 「판매 시작일·종료일」, ⑤ 「판매기간」).
--    NULL = 종료 없음(현행). 소비: 카탈로그·요금표는 경과 시 숨김, cart-resolve 는 거절.
alter table subscription_plans add column if not exists available_until timestamptz;
alter table subscription_plans drop constraint if exists subscription_plans_available_window_check;
alter table subscription_plans add constraint subscription_plans_available_window_check
  check (available_from is null or available_until is null or available_until > available_from);

comment on column plan_policies.starts_on is
  '정규 유형 수강 시작일(NULL=지급 즉시). 미래면 수강권 starts_at 을 이 날짜로 — feat-11-013 P3-b';
comment on column plan_policies.mid_entry_mode is
  'starts_on 경과 후 신청 처리: until_end(종료일까지, NULL 과 동일)|fixed_days(신청일+mid_entry_days)|closed(거절) — feat-11-013 P3-b';
comment on column plan_policies.mid_entry_days is
  'mid_entry_mode=fixed_days 일 때 신청일부터 수강 일수(상한 없음) — feat-11-013 P3-b';
comment on column subscription_plans.available_until is
  '판매 종료일(NULL=종료 없음). 경과 시 카탈로그 숨김·결제 거절. available_from 의 짝 — feat-11-013 P3-b';

select json_build_object(
  'pp_cols', (select json_agg(column_name) from information_schema.columns
               where table_schema = 'public' and table_name = 'plan_policies'
                 and column_name in ('starts_on', 'mid_entry_mode', 'mid_entry_days')),
  'sp_cols', (select json_agg(column_name) from information_schema.columns
               where table_schema = 'public' and table_name = 'subscription_plans'
                 and column_name = 'available_until')
) as r;
commit;
