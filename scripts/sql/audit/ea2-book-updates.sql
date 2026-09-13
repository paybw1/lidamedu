SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS book_updates_컬럼
  FROM information_schema.columns WHERE table_schema='public' AND table_name='book_updates';
