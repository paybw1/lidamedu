SELECT 'publications' AS t, string_agg(column_name,', ' ORDER BY ordinal_position) AS 컬럼
  FROM information_schema.columns WHERE table_schema='public' AND table_name='publications'
UNION ALL
SELECT 'publication_editions', string_agg(column_name,', ' ORDER BY ordinal_position)
  FROM information_schema.columns WHERE table_schema='public' AND table_name='publication_editions'
UNION ALL
SELECT 'publication_content_map', string_agg(column_name,', ' ORDER BY ordinal_position)
  FROM information_schema.columns WHERE table_schema='public' AND table_name='publication_content_map';
