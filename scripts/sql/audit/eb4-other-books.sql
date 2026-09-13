SELECT p.title, e.edition_label, m.content_type,
       count(*) AS 매핑, min(m.page_no) AS 최소쪽, max(m.page_no) AS 최대쪽
  FROM public.publication_content_map m
  JOIN public.publication_editions e ON e.edition_id=m.edition_id
  JOIN public.publications p ON p.publication_id=e.publication_id
 WHERE m.page_no IS NOT NULL
 GROUP BY 1,2,3 ORDER BY 1,3;
