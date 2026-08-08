-- feat-11-008 보완 ①③⑤
--  ① 재생 제한 판정을 watch_ledger(원장) 기준으로 되돌리기 위한 회차별 사용량 집계 함수.
--     설계 SSOT(D7·P6b)가 정한 소비량 정의가 watch_ledger 누적인데 구현이 watch_events
--     직접 합산이어서, 관리자 '사용량 초기화'(ledger reset 행)가 재생 제한에 반영되지 않았다.
--  ③ 집계를 DB 에서 수행 — 클라이언트 행 상한(20,000행)으로 인한 과소집계 제거.
--  ⑤ 정상가(취소선 표시용) 컬럼.

-- ── ① ③ 회차별 사용 초 (원장 SUM, 조정·초기화 반영. 음수는 0 으로 클램프) ──
create or replace function public.lms_lesson_usage_seconds(
  p_enrollment_id uuid,
  p_lesson_ids uuid[]
)
returns table (lesson_id uuid, seconds int)
language sql
stable
security definer
set search_path = public
as $$
  select l.lesson_id,
         greatest(coalesce(sum(l.seconds), 0), 0)::int as seconds
    from public.watch_ledger l
   where l.enrollment_id = p_enrollment_id
     and l.lesson_id = any(p_lesson_ids)
   group by l.lesson_id
$$;

comment on function public.lms_lesson_usage_seconds(uuid, uuid[]) is
  '회차별 재생 사용 초(watch_ledger SUM, 0 클램프) — 재생 제한 판정·관리자 CS 조회용 (feat-11-008 보완)';

-- 서버(service_role)에서만 호출한다 — PostgREST 로 노출하지 않는다.
revoke execute on function public.lms_lesson_usage_seconds(uuid, uuid[]) from public, anon, authenticated;

-- ── ⑤ 정상가(정가) — null 이면 할인 표시 없음. 판매가보다 작을 수 없다 ──
alter table public.subscription_plans
  add column if not exists list_price_krw int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_plans_list_price_chk'
  ) then
    alter table public.subscription_plans
      add constraint subscription_plans_list_price_chk
      check (list_price_krw is null or list_price_krw >= price_krw);
  end if;
end $$;

comment on column public.subscription_plans.list_price_krw is
  '정상가(원). null=할인 표시 없음. price_krw 보다 크면 카탈로그·상세에서 취소선+할인율 표시 (feat-11-008 보완)';
