SELECT m.page_no, m.sort_key, m.line_hint, c.case_number, left(c.nickname,30) AS 별칭
  FROM public.publication_content_map m
  JOIN public.publication_editions e ON e.edition_id=m.edition_id
  JOIN public.publications p ON p.publication_id=e.publication_id
  LEFT JOIN public.cases c ON c.case_id::text = m.content_id
 WHERE p.title='리담특허법 판례' AND m.page_no > 1000;
