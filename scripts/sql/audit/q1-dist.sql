-- 쿼리 1. 전수 분포 — 생성 해설(problem_explanation_drafts.content_md) 680건
WITH b AS (
  SELECT
    draft_id                               AS id,
    (content_md)::text                     AS body
  FROM public.problem_explanation_drafts
  WHERE content_md IS NOT NULL
),
m AS (
  SELECT
    id,
    length(body)                                                       AS len,
    (SELECT count(*) FROM regexp_matches(body, '\n\s*\n', 'g'))  + 1   AS paras,
    (SELECT count(*) FROM regexp_matches(body, '제\s*\d+\s*조(\s*의\s*\d+)?', 'g')) AS n_article,
    (SELECT count(*) FROM regexp_matches(body, '\d{2,4}\s*(후|허|다|두|도|나|므|드|가합|가단|고합|고단|재다)\s*\d+', 'g')) AS n_caseno,
    (SELECT count(*) FROM regexp_matches(body, '(대법원|특허법원|헌법재판소|고등법원|지방법원)', 'g')) AS n_court,
    (SELECT count(*) FROM regexp_matches(body, '[「『"“][^」』"”]{40,}[」』"”]', 'g')) AS n_longquote,
    (body ~ '결\s*론')       AS has_conclusion,
    (body ~ '근\s*거')       AS has_basis,
    (body ~ '(함정|주의|유의)') AS has_pitfall
  FROM b
)
SELECT
  count(*)                                                    AS total,
  round(avg(len))                                             AS len_avg,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY len)::int       AS len_p50,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY len)::int       AS len_p90,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY len)::int       AS len_p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY len)::int       AS len_p99,
  max(len)                                                    AS len_max,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY paras)::int     AS paras_p95,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY n_article)::int AS article_p95,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY n_caseno)::int  AS caseno_p95,
  round(100.0 * count(*) FILTER (WHERE n_article  > 0) / count(*), 1) AS pct_has_article,
  round(100.0 * count(*) FILTER (WHERE n_caseno   > 0) / count(*), 1) AS pct_has_caseno,
  round(100.0 * count(*) FILTER (WHERE n_court    > 0) / count(*), 1) AS pct_has_court,
  round(100.0 * count(*) FILTER (WHERE n_longquote> 0) / count(*), 1) AS pct_has_longquote,
  round(100.0 * count(*) FILTER (WHERE has_conclusion AND has_basis) / count(*), 1) AS pct_parseable,
  round(100.0 * count(*) FILTER (WHERE has_pitfall) / count(*), 1) AS pct_has_pitfall
FROM m;
