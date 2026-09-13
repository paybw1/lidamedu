-- ① problem_id 를 가진 테이블의 텍스트/JSONB 컬럼 전수 — 해설이 숨을 수 있는 자리.
WITH t AS (
  SELECT DISTINCT table_name FROM information_schema.columns
   WHERE table_schema='public' AND column_name='problem_id'
)
SELECT c.table_name,
       string_agg(c.column_name || ':' || c.data_type, ', ' ORDER BY c.ordinal_position) AS 텍스트컬럼
  FROM information_schema.columns c JOIN t ON t.table_name = c.table_name
 WHERE c.table_schema='public'
   AND c.data_type IN ('text','character varying','jsonb','json','ARRAY')
 GROUP BY c.table_name ORDER BY c.table_name;
