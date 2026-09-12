-- 상표·디자인을 포함하는 자기학습 상품이 있는가.
select code, name, product_kind, sale_status, subject_codes, is_active
  from public.subscription_plans
 where subject_codes is not null
 order by product_kind, code;
