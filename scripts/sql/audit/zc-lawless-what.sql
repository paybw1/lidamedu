SELECT p.origin::text AS origin, p.subject_type::text AS 과목구분, count(*) AS n,
       min(p.display_no) AS 최소번호, max(p.display_no) AS 최대번호,
       (array_agg(left(p.body_md, 36) ORDER BY p.display_no))[1] AS 표본
  FROM public.problems p
 WHERE p.deleted_at IS NULL AND p.law_id IS NULL
 GROUP BY p.origin, p.subject_type ORDER BY count(*) DESC;
