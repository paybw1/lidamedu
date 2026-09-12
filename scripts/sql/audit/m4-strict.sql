-- 경계 검사 — 번호 뒤에 숫자가 오면 다른 사건이다(2012허818 ≠ 2012허8180).
WITH want(no) AS (VALUES
  ('2025후10217'),('2021후10749'),('2020후11325'),('2017후1465'),('2017후462'),
  ('2016후2355'),('2013후2477'),('2012후1156'),('2012후2142'),('2010후2094')
),
src AS (
  SELECT coalesce(lower_case_number,'(번호없음)') AS host,
         regexp_replace(coalesce(body_text,''), '\s', '', 'g') AS flat
    FROM public.case_lower_courts WHERE deleted_at IS NULL
)
SELECT w.no,
       count(*) AS docs,
       (array_agg(s.host))[1] AS host,
       (array_agg(
          substring(s.flat from greatest(1, position(w.no in s.flat) - 45) for 110)
        ))[1] AS ctx
  FROM want w JOIN src s
    ON s.flat ~ ('(^|[^0-9])' || w.no || '([^0-9]|$)')
 GROUP BY w.no ORDER BY w.no;
