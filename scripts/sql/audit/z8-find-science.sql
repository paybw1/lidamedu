SELECT c.relname AS 테이블, c.reltuples::bigint AS 대략행수
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
   AND (c.relname ILIKE '%passage%' OR c.relname ILIKE '%figure%'
        OR c.relname ILIKE '%science%' OR c.relname ILIKE '%exam_item%'
        OR c.relname ILIKE '%question%')
 ORDER BY c.relname;
