-- 리담특허법 판례 제10판 쪽번호 이상치 — 최대 2022 는 쪽수로 보기 어렵다.
WITH m AS (
  SELECT m.page_no FROM public.publication_content_map m
    JOIN public.publication_editions e ON e.edition_id=m.edition_id
    JOIN public.publications p ON p.publication_id=e.publication_id
   WHERE p.title='리담특허법 판례' AND m.page_no IS NOT NULL
)
SELECT count(*) AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY page_no)::int AS p50,
       percentile_cont(0.95) WITHIN GROUP (ORDER BY page_no)::int AS p95,
       max(page_no) AS 최대,
       count(*) FILTER (WHERE page_no > 1000) AS "1000쪽초과",
       count(*) FILTER (WHERE page_no BETWEEN 1900 AND 2030) AS "연도같은값"
  FROM m;
