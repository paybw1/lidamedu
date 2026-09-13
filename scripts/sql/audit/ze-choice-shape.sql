-- choice_index 기준(0/1)과 정답 개수 분포. 예상문제 592문항 한정.
WITH ex AS (
  SELECT p.problem_id FROM public.problems p
    JOIN public.laws l ON l.law_id = p.law_id
   WHERE p.deleted_at IS NULL AND l.law_code='patent' AND p.origin='expected'
)
SELECT min(c.choice_index) AS 최소인덱스, max(c.choice_index) AS 최대인덱스,
       count(*) AS 선지수, count(*) FILTER (WHERE c.is_correct) AS 정답표시수,
       count(DISTINCT c.problem_id) AS 문항수,
       count(DISTINCT c.choice_type::text) AS 선지종류수,
       string_agg(DISTINCT c.choice_type::text, ',') AS 선지종류
  FROM public.problem_choices c JOIN ex ON ex.problem_id = c.problem_id;
