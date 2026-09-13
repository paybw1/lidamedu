-- 추록 7건이 실제로 무엇을 고치는가 — 본문 조각을 봐야 그 글이 몇 쪽인지 찾는다.
SELECT v.page_no AS 현재쪽, v.errata_title AS 제목,
       left(v.errata_payload::text, 420) AS payload
  FROM public.v_errata_sheet v
  JOIN public.publication_editions e ON e.edition_id = v.edition_id
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE p.title = '도해특허법' AND v.notice_status = 'published'
 ORDER BY v.page_no;
