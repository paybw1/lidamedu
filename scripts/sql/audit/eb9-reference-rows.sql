-- 참고자료(reference) 유닛의 매핑 관행 — sort_key·toc_path 를 어떻게 쓰나.
SELECT u.unit_key, u.ref_no, u.unit_no, u.chapter_no, u.chapter_title, u.pdf_page,
       m.page_no, m.sort_key, m.toc_path
  FROM public.dohae_units u
  LEFT JOIN public.publication_content_map m
    ON m.content_type='dohae' AND m.content_id = u.unit_id::text
 WHERE u.book_code='dohae_patent_20' AND u.kind='reference'
 ORDER BY u.pdf_page;
