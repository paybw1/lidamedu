-- ★아직 안 뒤진 곳 — case_lower_courts.body_text(우리가 받아 둔 판결문 원문).
--   지금까지 corpus 는 cases 본문만 봤다. 판결문 원문이 그 번호를 적고 있으면 실재가 확정된다.
WITH want(no) AS (VALUES
  ('2025후10217'),('2021후10749'),('2020후11325'),('2017후1465'),('2017후462'),
  ('2016후2355'),('2013후2477'),('2012후1156'),('2012후2142'),('2010후2094'),
  ('2009허7673'),('2009허7680'),('2011허7898'),('2013허8956'),('2011허1258'),
  ('2012허5387'),('2012허818'),('2013허1832'),('2016허106'),('2017허1342'),
  ('2017허4716'),('2016허9790'),('2016허5729'),('2020허7005'),('2024허15899'),
  ('2020허5948')
),
src AS (
  SELECT 'case_lower_courts.body_text' AS where_, lower_case_number AS host,
         regexp_replace(coalesce(body_text,''), '\s', '', 'g') AS flat
    FROM public.case_lower_courts WHERE deleted_at IS NULL
  UNION ALL
  SELECT 'cases 본문', case_number,
         regexp_replace(concat_ws(' ', summary_body_md, reasoning_md, comment_body_md, summary_items::text), '\s', '', 'g')
    FROM public.cases WHERE deleted_at IS NULL
)
SELECT w.no,
       count(*) FILTER (WHERE s.where_ = 'case_lower_courts.body_text') AS in_lower_fulltext,
       count(*) FILTER (WHERE s.where_ = 'cases 본문')                   AS in_cases_body,
       (array_agg(s.host ORDER BY s.host))[1:3]                          AS hosts
  FROM want w LEFT JOIN src s ON s.flat LIKE '%' || w.no || '%'
 GROUP BY w.no ORDER BY w.no;
