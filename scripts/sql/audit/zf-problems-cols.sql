SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS problems_컬럼
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='problems';
