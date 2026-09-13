-- 도해특허법 제20판 — 「참고 8 우리나라 특허법 규정에 반영된 특허협력조약(PCT)」 매핑 보충.
--
-- ★Phase 2 시드에서 이 유닛만 빠져 있었다(93/94). 매핑이 없으면 추록을 내도
--   제목에 쪽번호가 안 붙고 시트 정렬에서도 뒤로 밀린다 — 조용한 구멍이다.
-- ★page_no 330 은 PDF 364쪽 푸터 "330 · 圖解 특허법" 에서 실측했다.
--   앞뒤(t76 p.328 / t77 p.331)와도 맞는다.
-- ★sort_key·toc_path 는 같은 kind='reference' 행들의 관행을 그대로 따랐다
--   ({장}000.{순번} · 「제N장 장제목 / 유닛제목」).
INSERT INTO public.publication_content_map
  (edition_id, content_type, content_id, page_no, sort_key, toc_path)
SELECT e.edition_id,
       'dohae',
       '5911b768-b4ff-4978-8056-b4d2e7bcd59c',
       330,
       8000.01,
       '제8장 국제출원 / 우리나라 특허법 규정에 반영된 특허협력조약(PCT)'
  FROM public.publication_editions e
  JOIN public.publications p ON p.publication_id = e.publication_id
 WHERE p.title = '도해특허법' AND e.edition_label = '제20판'
ON CONFLICT (edition_id, content_type, content_id) DO NOTHING;
