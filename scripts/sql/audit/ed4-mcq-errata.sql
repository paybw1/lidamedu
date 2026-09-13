SELECT p.title AS 교재, v.sort_key AS 수록순, v.toc_path AS 단원,
       left(v.errata_title, 60) AS 제목
  FROM public.v_errata_sheet v
  JOIN public.publication_editions e ON e.edition_id = v.edition_id
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE v.content_type = 'mcq' AND v.notice_status = 'published'
 ORDER BY p.title, v.sort_key LIMIT 10;
