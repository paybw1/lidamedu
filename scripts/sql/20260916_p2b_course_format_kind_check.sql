-- feat-11-013 P2 (2차) — 강의상품 ⇔ course_format 불변식. ★P2 코드(upsertPlan 이 course_format 을 채움)가 운영에 배포된 뒤 적용.
-- 사전 점검: 강의상품인데 NULL 인 행이 0건이어야 한다.
begin;
do $$
declare n int;
begin
  select count(*) into n from subscription_plans where (product_kind in ('course','tpass')) <> (course_format is not null);
  if n > 0 then raise exception '불변식 위반 행 % 건 — 먼저 백필하라', n; end if;
end $$;
alter table subscription_plans drop constraint if exists subscription_plans_course_format_kind_check;
alter table subscription_plans add constraint subscription_plans_course_format_kind_check
  check ((product_kind in ('course', 'tpass')) = (course_format is not null));
commit;
