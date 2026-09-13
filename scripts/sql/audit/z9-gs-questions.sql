-- 자연과학(GS) 문항 — problems 와 별개 테이블. 소스문서·쌍 개념이 있는가.
SELECT (SELECT count(*) FROM public.gs_questions)                       AS gs_문항,
       (SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
          FROM information_schema.columns
         WHERE table_schema='public' AND table_name='gs_questions')     AS 컬럼;
