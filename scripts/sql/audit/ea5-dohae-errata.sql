-- 도해특허법 제20판 추록 7항목 — 시트에 찍히는 쪽번호.
SELECT v.page_no AS 추록쪽, v.line_hint, v.toc_path, v.content_type, v.content_id,
       v.errata_kind, left(v.errata_title, 46) AS 제목, v.notice_status, v.published_at::date
  FROM public.v_errata_sheet v
  JOIN public.publication_editions e ON e.edition_id = v.edition_id
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE p.title = '도해특허법'
 ORDER BY v.page_no NULLS LAST, v.published_at;
