-- 뷰·머티리얼라이즈드뷰에 해설 컬럼이 있는가 (앞 조회는 relkind='r' 만 봤다).
SELECT pc.relkind::text AS 종류, c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN pg_class pc ON pc.relname = c.table_name
  JOIN pg_namespace n ON n.oid = pc.relnamespace AND n.nspname='public'
 WHERE c.table_schema='public' AND pc.relkind IN ('v','m')
   AND c.column_name ~* 'explan|answer|rubric|commentary|solution'
 ORDER BY 1,2,3;
