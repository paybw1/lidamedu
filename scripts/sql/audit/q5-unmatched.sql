-- 미대조 사건번호 전건 — 문항·과목·주변 문맥까지.
WITH src AS (
  SELECT p.problem_id, p.display_no, coalesce(l.law_code,'science') AS subj, (p.explanation_md)::text AS body
  FROM public.problems p
  LEFT JOIN public.laws l ON l.law_id = p.law_id
  WHERE p.explanation_md IS NOT NULL AND p.deleted_at IS NULL
),
hit AS (
  SELECT s.problem_id, s.display_no, s.subj, replace(x[1],' ','') AS case_no, s.body
  FROM src s, regexp_matches(s.body, '(\d{2,4}\s*(?:후|허|다|두|도|나|므|드|가합|가단|고합|고단|재다)\s*\d+)', 'g') x
),
known AS (
  SELECT replace(case_number,' ','') AS case_no FROM public.cases WHERE deleted_at IS NULL
  UNION
  SELECT replace(lower_case_number,' ','') FROM public.case_lower_courts
   WHERE lower_case_number IS NOT NULL AND deleted_at IS NULL
)
SELECT DISTINCT h.subj, h.case_no, h.display_no, h.problem_id,
  substring(h.body from greatest(1, position(h.case_no in replace(h.body,' ','')) - 60) for 150) AS ctx
FROM hit h LEFT JOIN known k ON k.case_no = h.case_no
WHERE k.case_no IS NULL
ORDER BY h.subj, h.case_no;
