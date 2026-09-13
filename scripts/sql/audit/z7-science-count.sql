SELECT (SELECT count(*) FROM public.science_sections) AS science_sections,
       (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='science_sections') AS 컬럼;
