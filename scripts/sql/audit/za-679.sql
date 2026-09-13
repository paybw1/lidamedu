SELECT c.relname AS 테이블, c.reltuples::bigint AS 대략행수
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.reltuples BETWEEN 500 AND 4000
 ORDER BY c.reltuples DESC LIMIT 30;
