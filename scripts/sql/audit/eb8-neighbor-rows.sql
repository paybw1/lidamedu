-- 새 행을 인접 행과 같은 모양으로 넣기 위한 확인.
SELECT m.map_id, m.content_id, m.page_no, m.page_no_end, m.node_id, m.line_hint,
       m.toc_path, m.sort_key, m.source_discrepancy, u.unit_key, u.title
  FROM public.publication_content_map m
  JOIN public.dohae_units u ON u.unit_id::text = m.content_id
 WHERE m.content_type='dohae' AND u.pdf_page BETWEEN 358 AND 368
 ORDER BY u.pdf_page;
