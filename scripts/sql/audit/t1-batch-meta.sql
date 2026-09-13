-- 5월 vs 6월 배치의 메타 차이 — 무엇이 달라졌는지.
SELECT to_char(date_trunc('month', pr.created_at), 'YYYY-MM') AS m,
       pr.origin::text AS origin,
       pr.exam_round::text AS round,
       pr.review_status::text AS review,
       (pr.generated_at is not null) AS has_gen_at,
       (pr.gen_range is not null) AS has_gen_range,
       (pr.source_doc_id is not null) AS has_source_doc,
       (pr.source_chunk_ids is not null) AS has_chunks,
       coalesce(pr.created_by::text, '(없음)') AS created_by,
       count(*) AS n,
       round(avg(length(pr.explanation_md))) AS avg_len
  FROM public.problems pr JOIN public.laws l ON l.law_id = pr.law_id
 WHERE pr.deleted_at IS NULL AND pr.explanation_md IS NOT NULL AND l.law_code = 'patent'
 GROUP BY 1,2,3,4,5,6,7,8,9 ORDER BY 1, n DESC;
