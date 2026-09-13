-- 교재별 추록 항목과 쪽 표기 현황.
SELECT p.title AS 교재, e.edition_label AS 판, v.content_type,
       count(*) AS 항목,
       count(*) FILTER (WHERE v.page_no IS NOT NULL)                          AS 매핑쪽있음,
       count(*) FILTER (WHERE v.errata_payload->>'page_no' IS NOT NULL)       AS payload쪽있음,
       count(*) FILTER (WHERE v.errata_title ~ '\(p\.\d+\)')                  AS 제목에쪽표기
  FROM public.v_errata_sheet v
  JOIN public.publication_editions e ON e.edition_id = v.edition_id
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE v.notice_status = 'published'
 GROUP BY p.title, e.edition_label, v.content_type
 ORDER BY p.title, v.content_type;
