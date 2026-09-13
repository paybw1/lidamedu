SELECT c.relname AS 테이블,
       (SELECT string_agg(column_name,', ' ORDER BY ordinal_position)
          FROM information_schema.columns ic
         WHERE ic.table_schema='public' AND ic.table_name=c.relname) AS 컬럼
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname ILIKE 'dohae%'
 ORDER BY 1;
