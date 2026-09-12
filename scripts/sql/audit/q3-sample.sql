-- 쿼리 3. 층화 샘플 — 구간당 20건. 노드는 problem_systematic_links 경유(이 테이블엔 FK 가 없다).
WITH b AS (
  SELECT
    e.draft_id           AS id,
    (SELECT l.node_id FROM public.problem_systematic_links l
      WHERE l.problem_id = e.problem_id ORDER BY l.seq NULLS LAST LIMIT 1) AS node_id,
    (e.content_md)::text AS body
  FROM public.problem_explanation_drafts e
  WHERE e.content_md IS NOT NULL
),
bucketed AS (
  SELECT ntile(5) OVER (ORDER BY length(body)) AS bucket, * FROM b
),
picked AS (
  SELECT * FROM (
    SELECT *, row_number() OVER (PARTITION BY bucket ORDER BY md5(id::text)) AS rn
    FROM bucketed
  ) q WHERE rn <= 4
)
SELECT
  p.bucket,
  p.id,
  p.node_id,
  length(p.body) AS len,
  ARRAY(SELECT DISTINCT x[1] FROM regexp_matches(p.body, '(제\s*\d+\s*조(?:\s*의\s*\d+)?)', 'g') x) AS articles,
  ARRAY(SELECT DISTINCT x[1] FROM regexp_matches(p.body, '(\d{2,4}\s*(?:후|허|다|두|도|나|므|드|가합|가단|고합|고단|재다)\s*\d+)', 'g') x) AS case_nos,
  left(p.body, 220) AS head
FROM picked p
ORDER BY p.bucket, len;
