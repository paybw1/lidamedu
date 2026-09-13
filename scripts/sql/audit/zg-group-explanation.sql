SELECT table_name, column_name
  FROM information_schema.columns
 WHERE table_schema='public'
   AND (column_name ILIKE '%explanation%' OR column_name ILIKE '%commentary%' OR column_name ILIKE '%group%')
 ORDER BY table_name, column_name;
