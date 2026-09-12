-- B군 7종 — 리담 교재(content_chunks) 대조. CLAUDE.md 12조의 ③번 출처.
-- 경계 검사 포함. source_type 별로 어디서 나왔는지 함께 본다.
WITH want(no) AS (VALUES
  ('2021다257968'),('2019도14180'),('2017다245789'),
  ('2011다108085'),('2011다15469'),('2011후2737'),('2011후3727')
),
src AS (
  SELECT chunk_id, source_type::text AS stype, law_code, heading_path,
         regexp_replace(coalesce(body_text,''), '\s', '', 'g') AS flat
    FROM public.content_chunks
)
SELECT w.no, s.stype, s.law_code,
       count(*) AS chunks,
       (array_agg(s.heading_path))[1] AS heading,
       (array_agg(
          substring(s.flat from greatest(1, position(w.no in s.flat) - 70) for 170)
        ))[1] AS ctx
  FROM want w JOIN src s
    ON s.flat ~ ('(^|[^0-9])' || w.no || '([^0-9]|$)')
 GROUP BY w.no, s.stype, s.law_code ORDER BY w.no;
