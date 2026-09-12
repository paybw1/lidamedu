-- 쿼리 4. 인용 사건번호 실재 대조 — cases(상고심) + case_lower_courts(하급심) 양쪽과 맞춘다.
WITH src AS (
  SELECT p.problem_id, coalesce(l.law_code, 'science') AS subj, (p.explanation_md)::text AS body
  FROM public.problems p
  LEFT JOIN public.laws l ON l.law_id = p.law_id
  WHERE p.explanation_md IS NOT NULL AND p.deleted_at IS NULL
),
extracted AS (
  SELECT DISTINCT s.subj, replace(x[1], ' ', '') AS case_no
  FROM src s,
       regexp_matches(s.body, '(\d{2,4}\s*(?:후|허|다|두|도|나|므|드|가합|가단|고합|고단|재다)\s*\d+)', 'g') x
),
known AS (
  SELECT replace(case_number, ' ', '') AS case_no FROM public.cases WHERE deleted_at IS NULL
  UNION
  SELECT replace(lower_case_number, ' ', '') FROM public.case_lower_courts
   WHERE lower_case_number IS NOT NULL AND deleted_at IS NULL
)
SELECT
  e.subj,
  count(*)                                       AS distinct_cited,
  count(*) FILTER (WHERE k.case_no IS NOT NULL)  AS matched,
  count(*) FILTER (WHERE k.case_no IS NULL)      AS unmatched,
  round(100.0 * count(*) FILTER (WHERE k.case_no IS NULL) / count(*), 1) AS pct_unmatched
FROM extracted e
LEFT JOIN known k ON k.case_no = e.case_no
GROUP BY ROLLUP (e.subj)
ORDER BY distinct_cited DESC;
