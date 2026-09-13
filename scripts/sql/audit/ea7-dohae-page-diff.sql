-- 추록이 쓰는 page_no 와 도해 원본 pdf_page 를 맞대어 본다.
WITH ed AS (
  SELECT e.edition_id FROM public.publication_editions e
    JOIN public.publications p ON p.publication_id=e.publication_id
   WHERE p.title='도해특허법'
)
SELECT count(*)                                            AS 매핑,
       count(*) FILTER (WHERE m.page_no = u.pdf_page)      AS 같음,
       count(*) FILTER (WHERE m.page_no <> u.pdf_page)     AS 다름,
       count(*) FILTER (WHERE u.pdf_page IS NULL)          AS 원본쪽없음,
       min(m.page_no - u.pdf_page)                         AS 차이_최소,
       max(m.page_no - u.pdf_page)                         AS 차이_최대,
       round(avg(m.page_no - u.pdf_page), 2)               AS 차이_평균,
       mode() WITHIN GROUP (ORDER BY m.page_no - u.pdf_page) AS 차이_최빈
  FROM public.publication_content_map m
  JOIN ed ON ed.edition_id = m.edition_id
  JOIN public.dohae_units u ON u.unit_id::text = m.content_id
 WHERE m.content_type = 'dohae';
