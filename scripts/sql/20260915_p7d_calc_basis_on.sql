-- feat-11-013 P7-d — 계산 기준일 (요청서 11-5)
--
-- 요청서 11-5 마지막 두 줄이 빠져 있었다:
--   「환불접수 등록 시 **계산 기준일을 자동 저장**」
--   「계산 기준일 수정 시 변경사유·처리담당자·변경 전후 값을 기록」
--
-- 종전에는 `refunds.intake_at`(= 화면에 접수 버튼을 누른 시각)을 기준일로 썼다. 그래서 —
--   ① 전화·카카오톡으로 **먼저 요청한 날**을 소급할 수단이 없었고(학생 손해 — 관리자가
--      늦게 입력한 날짜만큼 이용일수가 붙는다),
--   ② 잘못 잡힌 기준일을 고칠 자리도, 고친 흔적을 남길 자리도 없었다.
--
-- 날짜(date)로 둔다 — 이용일수는 시각이 아니라 **KST 달력일**로 세기 때문이다.
--
-- 적용: node scripts/run-prod-sql.mjs scripts/sql/20260915_p7d_calc_basis_on.sql

alter table public.refunds
  add column if not exists calc_basis_on date;

comment on column public.refunds.calc_basis_on is
  '환불금액 계산 기준일(KST 달력일, 요청서 11-5). 접수 시 자동 저장하고, 실제 요청일이 다르면 '
  '관리자가 사유와 함께 고친다. 변경 이력은 audit_logs(refund.calc_basis_on) 에 남는다. '
  '★비어 있으면 계산은 intake_at 의 KST 날짜로 폴백한다(이 칸이 생기기 전 접수분).';

-- 접수분에 기준일 채우기 — 접수 시각의 KST 달력일. 적용 시점 refunds 0건이라 no-op 이지만,
-- 재적용·복구 시에도 같은 결과가 나오도록 남겨 둔다.
update public.refunds
   set calc_basis_on = (intake_at at time zone 'Asia/Seoul')::date
 where calc_basis_on is null;
