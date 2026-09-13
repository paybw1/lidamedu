-- 자연과학 679 은 problems 에 없다. 어느 테이블이고 소스문서·쌍 개념이 있는가.
SELECT c.table_name,
       count(*) FILTER (WHERE c.column_name ILIKE '%source_doc%') AS src_doc,
       count(*) FILTER (WHERE c.column_name ILIKE '%paired%')     AS paired,
       count(*) FILTER (WHERE c.column_name ILIKE '%explanation%') AS 해설컬럼
  FROM information_schema.columns c
 WHERE c.table_schema='public'
   AND (c.table_name ILIKE 'science%' OR c.table_name ILIKE '%passage%')
 GROUP BY c.table_name ORDER BY c.table_name;
