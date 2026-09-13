-- 정답이 어느 컬럼/테이블에 있는지 확인. 추측하지 않는다.
SELECT table_name, column_name, data_type, udt_name
  FROM information_schema.columns
 WHERE table_schema='public'
   AND table_name IN ('problems','problem_choices','problem_answers')
   AND (column_name ILIKE '%answer%' OR column_name ILIKE '%correct%' OR column_name ILIKE '%choice%')
 ORDER BY table_name, ordinal_position;
