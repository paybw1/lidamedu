-- ② 스키마 전체에서 해설 낌새가 있는 텍스트 컬럼 전수.
SELECT c.table_name, c.column_name, c.data_type
  FROM information_schema.columns c
  JOIN pg_class pc ON pc.relname = c.table_name
  JOIN pg_namespace n ON n.oid = pc.relnamespace AND n.nspname = 'public'
 WHERE c.table_schema = 'public' AND pc.relkind = 'r'
   AND c.data_type IN ('text','character varying','jsonb','json')
   AND (c.column_name ~* 'explan|haeseol|commentary|solution|rationale|reasoning|answer|rubric|grading|feedback|analysis|summary|description|note|comment|remark|tip|guide|hint')
 ORDER BY c.table_name, c.column_name;
