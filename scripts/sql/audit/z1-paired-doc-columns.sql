-- 문서 테이블 구조 파악 — paired_with_doc_id 가 어느 테이블에 있고 문항은 어떻게 매달리는가.
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public'
   AND (column_name ILIKE '%paired%' OR column_name ILIKE '%source_doc%' OR column_name = 'doc_id')
 ORDER BY table_name, ordinal_position;
