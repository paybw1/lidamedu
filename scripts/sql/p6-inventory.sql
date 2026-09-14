-- 오픈 전 운영 데이터 실사 (읽기 전용) — 무엇이 시험 데이터이고 무엇이 진짜인가.
select 'orders_total' k, count(*)::text v from orders
union all select 'orders_paid', count(*)::text from orders where status='paid'
union all select 'orders_pending_payment(레거시)', count(*)::text from orders where status='pending_payment'
union all select 'orders_attempted', count(*)::text from orders where status='attempted'
union all select 'orders_최근결제일', coalesce(max(paid_at)::text,'없음') from orders where status='paid'
union all select 'payments_completed', count(*)::text from payments where status='completed'
union all select 'payments_합계원', coalesce(sum(amount_krw),0)::text from payments where status='completed'
union all select 'enrollments_total', count(*)::text from enrollments
union all select 'enrollments_소유자수', count(distinct user_id)::text from enrollments
union all select 'watch_events_최근', coalesce(max(reported_at)::text,'없음') from watch_events
union all select 'profiles_total', count(*)::text from profiles
union all select 'profiles_student', count(*)::text from profiles where role='student'
union all select 'point_transactions', count(*)::text from point_transactions
union all select 'coupons_발급', count(*)::text from coupons
union all select 'books_판매중', count(*)::text from books where deleted_at is null
union all select 'courses_published', count(*)::text from courses where status='published' and deleted_at is null
union all select 'lesson_videos_active', count(*)::text from lesson_videos where is_active
union all select 'subscription_plans_onsale', count(*)::text from subscription_plans where sale_status='on_sale'

order by 1;
