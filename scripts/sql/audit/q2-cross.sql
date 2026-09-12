-- 쿼리 2. 길이 구간 × 인용 밀도 — 생성 해설 680건
WITH b AS (
  SELECT (content_md)::text AS body FROM public.problem_explanation_drafts WHERE content_md IS NOT NULL
),
m AS (
  SELECT
    length(body) AS len,
    (SELECT count(*) FROM regexp_matches(body, '\d{2,4}\s*(후|허|다|두|도|나|므|드|가합|가단|고합|고단|재다)\s*\d+', 'g')) AS n_caseno,
    (SELECT count(*) FROM regexp_matches(body, '[「『"“][^」』"”]{40,}[」』"”]', 'g')) AS n_longquote
  FROM b
),
bucketed AS (
  SELECT ntile(5) OVER (ORDER BY len) AS bucket, * FROM m
)
SELECT
  bucket,
  count(*)            AS n,
  min(len)            AS len_from,
  max(len)            AS len_to,
  round(avg(n_caseno)::numeric, 2)    AS caseno_avg,
  round(avg(n_longquote)::numeric, 2) AS longquote_avg,
  round(100.0 * count(*) FILTER (WHERE n_caseno > 0) / count(*), 1)    AS pct_caseno,
  round(100.0 * count(*) FILTER (WHERE n_longquote > 0) / count(*), 1) AS pct_longquote
FROM bucketed
GROUP BY bucket
ORDER BY bucket;
