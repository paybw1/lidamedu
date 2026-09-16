-- feat-11-013 P2 — 과정 유형 축 subscription_plans.course_format (설계 D1)
-- product_kind(무엇을 주는가)와 직교하는 「어떻게 운영하는가」 축. 강의상품(course/tpass)만 값을 갖고 학습 구독은 NULL.
-- 실측(2026-09-16 운영): course 3건·tpass 0건·lecture_category='onsite' 0건 → 백필 3행.
-- 롤백: scripts/sql/20260916_p2_course_format_rollback.sql · 2차(불변식) = 20260916_p2b_course_format_kind_check.sql (배포 후)
begin;

alter table subscription_plans add column if not exists course_format text;

alter table subscription_plans drop constraint if exists subscription_plans_course_format_check;
alter table subscription_plans add constraint subscription_plans_course_format_check
  check (course_format is null or course_format in
    ('online_always', 'online_term', 'offline', 'blended', 'package_term', 'package_always'));

-- 백필 (D1): course → 온라인 상시, tpass → 상시 패키지
update subscription_plans set course_format = 'online_always'
  where product_kind = 'course' and course_format is null;
update subscription_plans set course_format = 'package_always'
  where product_kind = 'tpass' and course_format is null;

-- ★강의상품 ⇔ course_format 불변식 CHECK 는 2차 파일(20260916_p2b_course_format_kind_check.sql)로 분리 —
--   P2 코드가 배포되기 전에 걸면 /admin/pricing 의 강의상품 생성(course_format NULL insert)이 CHECK 위반으로 막힌다.

create index if not exists subscription_plans_course_format_idx
  on subscription_plans (course_format) where course_format is not null;

comment on column subscription_plans.course_format is
  '과정 유형(운영 방식): online_always|online_term|offline|blended|package_term|package_always. 강의상품(course/tpass)만 not null — feat-11-013 D1';

select json_build_object(
  'by_format', (select json_agg(t) from (select product_kind, course_format, count(*) as n from subscription_plans group by 1, 2 order by 1, 2) t)
) as r;
commit;
