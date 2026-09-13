-- 진짜 축은 월이 아니라 origin 인가 — 같은 지표를 origin 별로 본다.
SELECT pr.origin::text AS origin, count(*) AS n,
       round(avg(length(pr.explanation_md))) AS avg_len,
       min(length(pr.explanation_md)) AS min_len,
       max(length(pr.explanation_md)) AS max_len,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '[「『"“][^」』"”]{40,}[」』"”]')/count(*),1) AS pct_quote,
       round(100.0*count(*) FILTER (WHERE pr.explanation_md ~ '제\s*\d+\s*조')/count(*),1) AS pct_art,
       round(100.0*count(*) FILTER (WHERE length(pr.explanation_md) < 100)/count(*),1) AS pct_thin,
       count(distinct pr.source_doc_id) AS src_docs
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL AND l.law_code = 'patent'
 GROUP BY 1 ORDER BY n DESC;
