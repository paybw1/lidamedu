-- 선지별 해설 분포 — 과목 × origin.
-- ★조문 표기는 두 꼴을 따로 센다: 「제130조」와 「法 130」(특허 교재 관용).
--   앞선 기준선 SQL 은 '제\s*\d+\s*조' 만 썼으므로 특허를 과소평가한다.
WITH p AS (
  SELECT pr.problem_id,
         coalesce(l.law_code, pr.subject_type::text, '(미분류)') AS 과목,
         pr.origin::text AS origin
    FROM public.problems pr
    LEFT JOIN public.laws l ON l.law_id = pr.law_id
   WHERE pr.deleted_at IS NULL
), c AS (
  SELECT p.과목, p.origin, c.problem_id, c.choice_index,
         length(coalesce(c.explanation_md,'')) AS len,
         btrim(coalesce(c.explanation_md,'')) <> '' AS 해설있음,
         coalesce(c.explanation_md,'') ~ '제\s*\d+\s*조'                                   AS 조문_제N조,
         coalesce(c.explanation_md,'') ~ '法\s*\d+'                                        AS 조문_法N,
         coalesce(c.explanation_md,'') ~ '\d{2,4}\s*(후|허|다|두|도|나|누|마|그|스)\s*\d+'   AS 사건번호
    FROM public.problem_choices c JOIN p ON p.problem_id = c.problem_id
), perprob AS (
  SELECT 과목, origin, problem_id,
         count(*) AS 선지수,
         count(*) FILTER (WHERE 해설있음) AS 해설선지수
    FROM c GROUP BY 1,2,3
)
SELECT c.과목, c.origin,
       (SELECT count(*) FROM perprob q WHERE q.과목=c.과목 AND q.origin=c.origin)                       AS 문항수,
       round((SELECT avg(선지수) FROM perprob q WHERE q.과목=c.과목 AND q.origin=c.origin),2)            AS 문항당_선지수,
       round((SELECT avg(해설선지수) FROM perprob q WHERE q.과목=c.과목 AND q.origin=c.origin),2)        AS 문항당_해설선지수,
       round(100.0*count(*) FILTER (WHERE c.해설있음)/count(*),1)                                        AS 선지_해설보유율,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY c.len) FILTER (WHERE c.해설있음)::int                AS 선지해설_p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY c.len) FILTER (WHERE c.해설있음)::int                AS 선지해설_p95,
       round(100.0*count(*) FILTER (WHERE c.해설있음 AND c.조문_제N조)/nullif(count(*) FILTER (WHERE c.해설있음),0),1) AS "조문%_제N조",
       round(100.0*count(*) FILTER (WHERE c.해설있음 AND c.조문_法N)/nullif(count(*) FILTER (WHERE c.해설있음),0),1)   AS "조문%_法N",
       round(100.0*count(*) FILTER (WHERE c.해설있음 AND (c.조문_제N조 OR c.조문_法N))/nullif(count(*) FILTER (WHERE c.해설있음),0),1) AS "조문%_합",
       round(100.0*count(*) FILTER (WHERE c.해설있음 AND c.사건번호)/nullif(count(*) FILTER (WHERE c.해설있음),0),1)   AS "사건번호%"
  FROM c
 GROUP BY c.과목, c.origin
 ORDER BY c.과목, 문항수 DESC;
