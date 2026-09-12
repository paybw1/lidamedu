-- B군 7종을 판결문 원문 창고(case_lower_courts.body_text)와 cases 본문에 돌린다.
-- 경계 검사 — 번호 뒤에 숫자가 오면 다른 사건이다.
WITH want(no) AS (VALUES
  ('2021다257968'),('2019도14180'),('2017다245789'),
  ('2011다108085'),('2011다15469'),('2011후2737'),('2011후3727')
),
src AS (
  SELECT '판결문 원문' AS kind, coalesce(lower_case_number,'(번호없음)') AS host,
         regexp_replace(coalesce(body_text,''), '\s', '', 'g') AS flat
    FROM public.case_lower_courts WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'cases 본문', case_number,
         regexp_replace(
           concat_ws(' ', summary_body_md, reasoning_md, comment_body_md, summary_items::text),
           '\s', '', 'g')
    FROM public.cases WHERE deleted_at IS NULL
)
SELECT w.no,
       s.kind,
       count(*) AS docs,
       (array_agg(s.host))[1] AS host,
       (array_agg(
          substring(s.flat from greatest(1, position(w.no in s.flat) - 60) for 150)
        ))[1] AS ctx
  FROM want w JOIN src s
    ON s.flat ~ ('(^|[^0-9])' || w.no || '([^0-9]|$)')
 GROUP BY w.no, s.kind ORDER BY w.no;
