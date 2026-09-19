-- 2026-09-19 운영 보정: 강의 상품(tpass)이 구독 축(user_subscriptions)에 잘못 부여된 행 정리.
-- 원인 = 회원 상세 패널 드롭다운에 강의 상품이 걸러지지 않음(같은 커밋에서 코드 수정).
-- 영향 = 등급 판정은 SELF_STUDY_PRODUCT_KINDS 로 이미 걸러져 권한 영향 없음.
--        다만 「한 사람 한 구독」 auto_cancel 이 정상 구독을 취소시킬 위험이 있어 정리한다.
-- 대상 = CHO(manager, member_no 6) 의 pt_tpass 구독 1건. 수강권 재지급은 하지 않는다
--        (staff 계정은 requestPlaybackGrant 에서 수강권 게이트가 면제되므로 실익 없음).
begin;

-- 보정 전 스냅샷(결과로 확인)
select 'before' as phase, us.subscription_id::text as subscription_id, sp.code as plan_code,
       us.status::text as status, to_char(us.expires_at,'YYYY-MM-DD') as expires_at
from user_subscriptions us join subscription_plans sp on sp.plan_id = us.plan_id
where us.subscription_id = '0ad20e9d-d074-4749-b2e7-d456ce447902';

insert into subscription_admin_logs (subscription_id, user_id, actor_id, action, detail, note)
select us.subscription_id, us.user_id, null, 'cancel',
       jsonb_build_object(
         'via', 'ops_fix_wrong_axis',
         'planCode', sp.code,
         'productKind', sp.product_kind,
         'beforeStatus', us.status::text,
         'reason', '강의 상품이 구독 축에 잘못 부여됨 — 영상 수강권(enrollments)이 정상 축'
       ),
       '2026-09-19 운영 보정(원장 진행 OK): 회원 상세 패널의 상품 필터 누락으로 생긴 행'
from user_subscriptions us join subscription_plans sp on sp.plan_id = us.plan_id
where us.subscription_id = '0ad20e9d-d074-4749-b2e7-d456ce447902';

update user_subscriptions
set status = 'cancelled', updated_at = now()
where subscription_id = '0ad20e9d-d074-4749-b2e7-d456ce447902'
  and status = 'active';

-- 보정 후 확인
select 'after' as phase, us.subscription_id::text as subscription_id, sp.code as plan_code,
       us.status::text as status, to_char(us.expires_at,'YYYY-MM-DD') as expires_at
from user_subscriptions us join subscription_plans sp on sp.plan_id = us.plan_id
where us.subscription_id = '0ad20e9d-d074-4749-b2e7-d456ce447902';

commit;
