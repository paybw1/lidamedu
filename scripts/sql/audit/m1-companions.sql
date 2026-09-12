-- A군 10종이 실린 판례 도식에서 **같이 적힌 번호를 전부** 뽑는다.
--   법원 사건번호(허·후·나·가합…) + 특허심판원 심판번호(당·원·정·취·소·재)를 함께 본다.
WITH want(no) AS (VALUES
  ('2025후10217'),('2021후10749'),('2020후11325'),('2017후1465'),('2017후462'),
  ('2016후2355'),('2013후2477'),('2012후1156'),('2012후2142'),('2010후2094')
),
dg AS (
  SELECT d.diagram_id, d.case_id,
         concat_ws(E'\n', d.facts_md, d.blocks::text) AS body
    FROM public.case_diagrams d
   WHERE d.deleted_at IS NULL
),
hit AS (
  SELECT w.no AS target, g.diagram_id, g.case_id, g.body
    FROM want w JOIN dg g ON g.body LIKE '%' || w.no || '%'
)
SELECT h.target,
       c.case_number AS host_case,
       ARRAY(
         SELECT DISTINCT x[1]
           FROM regexp_matches(h.body,
             '(\d{2,4}(?:허|후|나|가합|가단|카합|당|원|정|취|소|재)\d+)', 'g') x
          WHERE x[1] <> h.target
       ) AS companions
  FROM hit h
  LEFT JOIN public.cases c ON c.case_id = h.case_id
 ORDER BY h.target;
