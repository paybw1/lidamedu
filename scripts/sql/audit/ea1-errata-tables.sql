SELECT c.relname AS 테이블, obj_description(c.oid) AS 설명
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND (c.relname ILIKE '%errata%' OR c.relname ILIKE '%publication%' OR c.relname ILIKE '%book_update%')
 ORDER BY 1;
