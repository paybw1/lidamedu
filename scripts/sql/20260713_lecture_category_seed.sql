-- 데모 상품 카테고리 기본값(운영자가 /admin/pricing 에서 조정 가능).
update public.subscription_plans set lecture_category = 'round1'  where code = 'patent_basic_2026';
update public.subscription_plans set lecture_category = 'package' where code in ('bundle_ip', 'bundle_all');
select code, name, product_kind, lecture_category from public.subscription_plans
where product_kind in ('course','tpass','bundle') order by product_kind, name;
