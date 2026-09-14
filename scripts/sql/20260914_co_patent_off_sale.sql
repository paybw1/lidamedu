-- feat-11-012 — 「특허법 중급강의 2026」 판매 중지 (원장 결정 2026-09-14).
--
-- ★왜: plan_courses 가 0건이다. 지급(fulfillCourseEnrollments)은 그 표를 훑어 수강권을
--   주므로, 연결된 강의가 없으면 **45만원을 받고 아무것도 주지 않는다.** 리허설 2차
--   주문이 실제로 수강권 0건으로 끝나 발견됐다.
-- ★결제 경로에는 가드를 넣었지만(resolveCartItems), 그건 구멍을 막은 것이지 카탈로그에서
--   내린 것이 아니다. 사는 길이 막힌 상품을 진열해 두면 학생이 담고 결제 단계에서 거절당한다.
--
-- ★스위치가 is_active 인 이유: 강의 카탈로그(listSellableLectureProducts)는
--   `.eq("is_active", true)` 만 본다. sale_status 칼럼이 따로 있지만 이 쿼리는 참조하지
--   않으므로, sale_status 를 바꿔도 진열에서 내려가지 않는다.
--
-- 되돌리기(강의를 연결한 뒤):
--   update public.subscription_plans
--      set is_active = true, sale_status = 'on_sale' where code = 'co_patent';

-- ★두 칸을 함께 맞춘다. is_active 만 내리면 운영 강의목록(/admin/lectures)에는
--   여전히 「판매중」(sale_status=on_sale)으로 보여, 왜 학생에게 안 보이는지 알 수 없다.
update public.subscription_plans
   set is_active = false,
       sale_status = 'paused',
       updated_at = now()
 where code = 'co_patent';

select code,
       name,
       price_krw,
       is_active,
       sale_status,
       (select count(*) from plan_courses pc where pc.plan_id = subscription_plans.plan_id) as courses
  from public.subscription_plans
 where product_kind in ('course', 'tpass')
   and price_krw > 0
 order by is_active desc, price_krw desc;
