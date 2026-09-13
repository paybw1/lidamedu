-- 매핑 없는 도해 유닛 — 왜 빠졌나. 같은 쪽에 다른 유닛이 있는지 본다.
SELECT u.unit_id, u.unit_key, u.kind, u.chapter_no, u.ref_no, u.title, u.pdf_page,
       (SELECT count(*) FROM public.publication_content_map m
         WHERE m.content_type='dohae' AND m.content_id = u.unit_id::text) AS 매핑수
  FROM public.dohae_units u
 WHERE u.book_code='dohae_patent_20' AND u.pdf_page BETWEEN 360 AND 370
 ORDER BY u.pdf_page;
