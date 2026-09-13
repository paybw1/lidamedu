-- 추록 제목·쪽번호가 어디서 오는가. v_errata_sheet 정의와 원본 행.
SELECT pg_get_viewdef('public.v_errata_sheet'::regclass, true) AS 뷰정의;
