-- ① 길이 구간 × 조문 보유율 (특허 해설). ★problems 에 law_code 없음 — laws 조인.
WITH p AS (
  SELECT pr.problem_id AS id, pr.explanation_md::text AS body
    FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
   WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL AND l.law_code = 'patent'
),
m AS (
  SELECT length(body) AS len,
         (SELECT count(*) FROM regexp_matches(body,'제\s*\d+\s*조','g')) AS n_art,
         (SELECT count(*) FROM regexp_matches(body,'[「『"“][^」』"”]{40,}[」』"”]','g')) AS n_q
    FROM p
),
b AS (SELECT ntile(5) OVER (ORDER BY len) AS bk, * FROM m)
SELECT bk, count(*) AS n, min(len) AS from_, max(len) AS to_,
       round(100.0*count(*) FILTER (WHERE n_art>0)/count(*),1) AS pct_art,
       round(100.0*count(*) FILTER (WHERE n_q>0)/count(*),1)   AS pct_quote
  FROM b GROUP BY bk ORDER BY bk;
