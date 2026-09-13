SELECT p.title AS 교재, p.subject_code AS 과목, e.edition_label AS 판, e.edition_seq, e.status,
       e.errata_sheet_item_count AS 추록항목, e.errata_sheet_updated_at,
       (SELECT count(*) FROM public.publication_content_map m WHERE m.edition_id=e.edition_id) AS 매핑,
       (SELECT count(*) FROM public.publication_content_map m WHERE m.edition_id=e.edition_id AND m.page_no IS NOT NULL) AS 쪽있음,
       (SELECT min(m.page_no) FROM public.publication_content_map m WHERE m.edition_id=e.edition_id) AS 최소쪽,
       (SELECT max(m.page_no) FROM public.publication_content_map m WHERE m.edition_id=e.edition_id) AS 최대쪽
  FROM public.publications p
  LEFT JOIN public.publication_editions e ON e.publication_id=p.publication_id
 WHERE p.deleted_at IS NULL
 ORDER BY p.title, e.edition_seq;
