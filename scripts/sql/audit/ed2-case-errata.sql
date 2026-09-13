SELECT v.page_no AS 쪽, v.sort_key AS 수록순, v.errata_title AS 제목, v.content_id,
       left(v.errata_payload::text, 300) AS payload
  FROM public.v_errata_sheet v
  JOIN public.publication_editions e ON e.edition_id = v.edition_id
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE p.title = '리담특허법 판례' AND v.notice_status = 'published'
 ORDER BY v.page_no;
